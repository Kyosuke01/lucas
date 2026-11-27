//! Examen des fichiers joints. Ce code tourne dans un conteneur à part, sans
//! réseau ni accès aux données de LUCAS. Les fichiers sont lus, jamais exécutés.

use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{self, Read, Seek, SeekFrom},
    path::Path,
    process::{Command, Stdio},
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};

pub const JOB_PREFIX: &str = "job-";
pub const FILE: &str = "file";
pub const REQUEST: &str = "request.json";
pub const REPORT: &str = "report.json";
/// Retouché chaque seconde : preuve que le bac à sable tourne.
pub const ALIVE: &str = "alive";

/// Début et fin d'un long texte transmis au modèle, en caractères.
const HEAD: usize = 8_000;
const TAIL: usize = 2_000;
/// XML lu au plus dans un document : surtout des balises.
const XML: u64 = 4 * 1024 * 1024;
/// Octets lus au plus dans la sortie d'un outil (UTF-8 : 4 par caractère).
const OUTPUT: u64 = (HEAD as u64) * 4;
const TOOL_SECONDS: &str = "60";

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Report {
    pub kind: String,
    pub size: u64,
    pub sha256: String,
    /// Texte lisible, entier ou en partie. Vide pour un contenu sans texte.
    pub excerpt: String,
    /// Le modèle ne verra qu'une partie du contenu.
    pub truncated: bool,
    pub notes: Vec<String>,
    /// Petite image JPEG en base64 (première page, image de la vidéo).
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub preview: String,
}

/// Pages d'un PDF numérisé et images d'une vidéo lues au plus.
const SCANNED_PAGES: usize = 5;
const FRAMES: usize = 4;
/// Un aperçu doit tenir dans le rapport.
const MAX_PREVIEW: u64 = 120 * 1024;

/// Boucle du bac à sable : examine chaque fichier déposé dans `directory`.
pub fn run(directory: &Path) -> io::Result<()> {
    let alive = directory.join(ALIVE);
    fs::write(&alive, b"")?;
    std::thread::spawn(move || {
        loop {
            if let Err(error) = fs::write(&alive, b"") {
                eprintln!("Signe de vie non écrit : {error}");
            }
            std::thread::sleep(Duration::from_secs(1));
        }
    });
    println!("Bac à sable prêt dans {}", directory.display());
    loop {
        process_pending(directory);
        std::thread::sleep(Duration::from_millis(200));
    }
}

fn process_pending(directory: &Path) {
    for entry in fs::read_dir(directory).into_iter().flatten().flatten() {
        let job = entry.path();
        let pending = entry.file_name().to_string_lossy().starts_with(JOB_PREFIX)
            && job.join(REQUEST).is_file()
            && !job.join(REPORT).exists();
        if !pending {
            continue;
        }
        let name = fs::read(job.join(REQUEST))
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
            .and_then(|request| request["name"].as_str().map(str::to_string))
            .unwrap_or_default();
        let report = examine(&job.join(FILE), &name).unwrap_or_else(|error| Report {
            kind: "illisible".into(),
            notes: vec![format!("Examen impossible : {error}")],
            ..Report::default()
        });
        let temporary = job.join("report.tmp");
        let written = serde_json::to_vec(&report)
            .map_err(io::Error::from)
            .and_then(|bytes| fs::write(&temporary, bytes))
            .and_then(|()| fs::rename(&temporary, job.join(REPORT)));
        // La page a pu abandonner : son dossier n'existe alors plus.
        if let Err(error) = written {
            eprintln!("Rapport non écrit : {error}");
        }
    }
}

/// Empreinte, taille et nombre de lignes, calculés sur le fichier entier.
fn measure(path: &Path) -> io::Result<(String, u64, u64)> {
    let mut file = File::open(path)?;
    let mut hash = Sha256::new();
    let mut buffer = vec![0; 1 << 20];
    let (mut size, mut lines) = (0, 0);
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hash.update(&buffer[..read]);
        size += read as u64;
        lines += buffer[..read].iter().filter(|&&b| b == b'\n').count() as u64;
    }
    let hex = hash.finalize().iter().map(|b| format!("{b:02x}")).collect();
    Ok((hex, size, lines))
}

fn read_at(path: &Path, offset: u64, length: u64) -> io::Result<Vec<u8>> {
    let mut file = File::open(path)?;
    file.seek(SeekFrom::Start(offset))?;
    let mut bytes = Vec::new();
    file.take(length).read_to_end(&mut bytes)?;
    Ok(bytes)
}

/// UTF-8 sans octet nul. Le dernier caractère a pu être coupé par la lecture.
fn is_text(start: &[u8]) -> bool {
    !start.contains(&0)
        && match std::str::from_utf8(start) {
            Ok(_) => true,
            Err(error) => error.error_len().is_none(),
        }
}

fn first_chars(text: &str, count: usize) -> &str {
    text.char_indices()
        .nth(count)
        .map_or(text, |(end, _)| &text[..end])
}

fn last_chars(text: &str, count: usize) -> &str {
    let start = text.char_indices().rev().nth(count - 1);
    start.map_or(text, |(start, _)| &text[start..])
}

fn text_excerpt(path: &Path, size: u64) -> io::Result<(String, bool)> {
    let whole = (HEAD + TAIL) as u64 * 4;
    if size <= whole {
        let text = String::from_utf8_lossy(&read_at(path, 0, whole)?).into_owned();
        if text.chars().count() <= HEAD + TAIL {
            return Ok((text, false));
        }
        return Ok((
            join(first_chars(&text, HEAD), last_chars(&text, TAIL)),
            true,
        ));
    }
    let head = String::from_utf8_lossy(&read_at(path, 0, OUTPUT)?).into_owned();
    let length = TAIL as u64 * 4;
    let tail = String::from_utf8_lossy(&read_at(path, size - length, length)?).into_owned();
    Ok((
        join(first_chars(&head, HEAD), last_chars(&tail, TAIL)),
        true,
    ))
}

fn join(head: &str, tail: &str) -> String {
    format!("{head}\n\n[… passage non transmis …]\n\n{tail}")
}

/// Lance un outil du conteneur, borné en durée et en sortie.
fn tool(program: &str, arguments: &[&str], file: &Path, after: &[&str]) -> Option<String> {
    run_tool(program, arguments, file, after, OUTPUT).map(|(text, _)| text)
}

/// Comme `tool`, en disant si la sortie dépassait `limit` octets.
fn run_tool(
    program: &str,
    arguments: &[&str],
    file: &Path,
    after: &[&str],
    limit: u64,
) -> Option<(String, bool)> {
    let mut child = Command::new("timeout")
        // `-k` : un outil qui ignore la demande d'arrêt est tué.
        .args(["-k", "5", TOOL_SECONDS])
        .arg(program)
        .args(arguments)
        .arg(file)
        .args(after)
        // Un seul cœur est accordé au bac à sable.
        .env("OMP_THREAD_LIMIT", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut bytes = Vec::new();
    let mut out = child.stdout.take()?;
    let read = (&mut out).take(limit).read_to_end(&mut bytes);
    // Le reste est jeté : tuer `timeout` laisserait l'outil orphelin.
    let rest = io::copy(&mut out, &mut io::sink()).unwrap_or(0);
    let _ = child.wait();
    read.ok()?;
    let text = String::from_utf8_lossy(&bytes).trim().to_string();
    (!text.is_empty()).then_some((text, rest > 0))
}

/// Les 32 caractères propres à Windows-1252, de 0x80 à 0x9F.
const WINDOWS_1252: [char; 32] = [
    '€', ' ', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', ' ', 'Ž', ' ', ' ', '‘', '’',
    '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', ' ', 'ž', 'Ÿ',
];

/// Texte UTF-16 (avec sa marque) ou Windows-1252.
fn decode(bytes: &[u8]) -> String {
    let utf16 = |rest: &[u8], big: bool| {
        let units = rest.as_chunks::<2>().0.iter().map(|&pair| {
            if big {
                u16::from_be_bytes(pair)
            } else {
                u16::from_le_bytes(pair)
            }
        });
        char::decode_utf16(units)
            .map(|c| c.unwrap_or(char::REPLACEMENT_CHARACTER))
            .collect()
    };
    match bytes {
        [0xff, 0xfe, rest @ ..] => utf16(rest, false),
        [0xfe, 0xff, rest @ ..] => utf16(rest, true),
        _ => bytes
            .iter()
            .map(|&byte| match byte {
                0x80..=0x9f => WINDOWS_1252[usize::from(byte - 0x80)],
                _ => char::from(byte),
            })
            .collect(),
    }
}

/// Texte d'un document XML : les balises de fin de paragraphe deviennent des lignes.
fn strip_xml(xml: &str) -> String {
    let mut text = String::new();
    for (index, part) in xml.split('<').enumerate() {
        let (tag, content) = match part.split_once('>') {
            Some(split) if index > 0 => split,
            // Balise coupée par la limite de lecture.
            None if index > 0 => continue,
            _ => ("", part),
        };
        let breaks = ["/w:p", "/a:p", "/text:p", "/si"];
        if breaks.contains(&tag) && !text.ends_with('\n') {
            text.push('\n');
        }
        text.push_str(content);
    }
    text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
        .trim()
        .to_string()
}

fn zip(path: &Path, extension: &str, report: &mut Report) -> (String, Option<String>) {
    let (kind, parts) = match extension {
        "docx" => ("document Word", "word/document.xml"),
        "pptx" => ("présentation PowerPoint", "ppt/slides/*.xml"),
        "xlsx" => ("classeur Excel", "xl/sharedStrings.xml"),
        "odt" | "ods" | "odp" => ("document OpenDocument", "content.xml"),
        _ => ("archive ZIP", ""),
    };
    let text = if parts.is_empty() {
        tool("unzip", &["-Z1"], path, &[])
    } else {
        run_tool("unzip", &["-p"], path, &[parts], XML).map(|(xml, cut)| {
            report.truncated = cut;
            strip_xml(&xml)
        })
    };
    if extension == "xlsx" {
        report
            .notes
            .push("Classeur : seuls les textes des cellules sont lus, pas les nombres.".into());
    }
    (kind.into(), text)
}

/// Largeur et hauteur annoncées par un PNG.
fn png_size(start: &[u8]) -> Option<(u32, u32)> {
    let number = |at: usize| Some(u32::from_be_bytes(start.get(at..at + 4)?.try_into().ok()?));
    Some((number(16)?, number(20)?))
}

/// Texte reconnu dans une image (français et anglais).
fn ocr(image: &Path) -> Option<String> {
    tool("tesseract", &[], image, &["stdout", "-l", "fra+eng"])
        .filter(|text| text.chars().filter(|c| c.is_alphanumeric()).count() >= 3)
}

/// Dossier de travail effacé avec l'examen.
struct Scratch(std::path::PathBuf);

impl Scratch {
    fn new() -> io::Result<Self> {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let next = NEXT.fetch_add(1, Ordering::Relaxed);
        let name = format!("lucas-work-{}-{next}", std::process::id());
        let path = std::env::temp_dir().join(name);
        fs::create_dir_all(&path)?;
        Ok(Self(path))
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn encoded(image: &Path) -> String {
    match fs::metadata(image) {
        Ok(data) if data.len() <= MAX_PREVIEW => {
            fs::read(image).map_or(String::new(), |bytes| STANDARD.encode(bytes))
        }
        _ => String::new(),
    }
}

/// Première page en aperçu ; sans texte, les premières pages sont reconnues.
fn pdf(path: &Path, report: &mut Report) -> io::Result<Option<String>> {
    let work = Scratch::new()?;
    let first = work.0.join("first");
    let target = first.to_string_lossy();
    let options = [
        "-jpeg",
        "-singlefile",
        "-f",
        "1",
        "-l",
        "1",
        "-scale-to",
        "480",
    ];
    tool("pdftoppm", &options, path, &[&target]);
    report.preview = encoded(&first.with_extension("jpg"));

    let text = tool("pdftotext", &["-q", "-enc", "UTF-8"], path, &["-"]);
    if text.is_some() {
        return Ok(text);
    }
    let pages = work.0.join("page");
    let last = SCANNED_PAGES.to_string();
    let target = pages.to_string_lossy();
    let options = ["-png", "-r", "150", "-f", "1", "-l", &last];
    tool("pdftoppm", &options, path, &[&target]);
    let pages_total = tool("pdfinfo", &[], path, &[]).and_then(|info| {
        let line = info.lines().find_map(|l| l.strip_prefix("Pages:"))?;
        line.trim().parse::<usize>().ok()
    });
    report.truncated = pages_total.is_none_or(|total| total > SCANNED_PAGES);
    let mut images: Vec<_> = fs::read_dir(&work.0)?
        .flatten()
        .map(|entry| entry.path())
        .filter(|image| image.extension().is_some_and(|e| e == "png"))
        .collect();
    images.sort();
    let found: Vec<String> = images.iter().filter_map(|image| ocr(image)).collect();
    if found.is_empty() {
        return Ok(None);
    }
    report.notes.push(format!(
        "PDF sans texte : texte reconnu sur les {SCANNED_PAGES} premières pages au plus."
    ));
    Ok(Some(found.join("\n\n")))
}

/// Durée, formats, sous-titres, et texte visible sur quelques images.
fn media(path: &Path, video: bool, report: &mut Report) -> io::Result<()> {
    let probe = [
        "-v",
        "error",
        "-protocol_whitelist",
        "file",
        "-show_entries",
        "format=duration:stream=codec_type,codec_name,width,height",
        "-of",
        "json",
    ];
    let found: Value = tool("ffprobe", &probe, path, &[])
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default();
    let duration: f64 = found["format"]["duration"]
        .as_str()
        .and_then(|seconds| seconds.parse().ok())
        .unwrap_or(0.0);
    if duration > 0.0 {
        let seconds = duration.round() as u64;
        report.notes.push(format!(
            "Durée : {} min {:02} s",
            seconds / 60,
            seconds % 60
        ));
    }
    for stream in found["streams"].as_array().into_iter().flatten() {
        let codec = stream["codec_name"].as_str().unwrap_or("inconnu");
        match stream["codec_type"].as_str() {
            Some("video") => report.notes.push(format!(
                "Image : {codec}, {} × {}",
                stream["width"], stream["height"]
            )),
            Some("audio") => report.notes.push(format!("Son : {codec}")),
            Some("subtitle") => report.notes.push("Sous-titres présents.".into()),
            _ => {}
        }
    }
    let input = ["-v", "error", "-protocol_whitelist", "file", "-i"];
    let subtitles = tool("ffmpeg", &input, path, &["-map", "0:s:0", "-f", "srt", "-"]);
    let mut text = subtitles.map_or(String::new(), |s| format!("Sous-titres :\n{s}\n"));

    if video {
        let work = Scratch::new()?;
        let mut seen = String::new();
        let mut last = String::new();
        // Sans durée connue, toutes les positions seraient la même.
        let frames = if duration > 0.0 { FRAMES } else { 1 };
        for index in 0..frames {
            let at = format!("{:.2}", duration * (index as f64 + 0.5) / FRAMES as f64);
            let frame = work.0.join(format!("{index}.jpg"));
            let target = frame.to_string_lossy();
            let seek = [
                "-v",
                "error",
                "-threads",
                "1",
                "-protocol_whitelist",
                "file",
                "-ss",
                &at,
                "-i",
            ];
            let shape = ["-frames:v", "1", "-vf", "scale='min(960,iw)':-2", &target];
            tool("ffmpeg", &seek, path, &shape);
            if !frame.is_file() {
                continue;
            }
            if report.preview.is_empty() {
                let small = work.0.join("preview.jpg");
                let target = small.to_string_lossy();
                let shape = ["-vf", "scale=480:-2", &target];
                tool("ffmpeg", &["-v", "error", "-i"], &frame, &shape);
                report.preview = encoded(&small);
            }
            // Une image fixe ne répète pas son texte.
            if let Some(words) = ocr(&frame)
                && words != last
            {
                seen += &format!("À {at} s : {words}\n");
                last = words;
            }
        }
        if !seen.is_empty() {
            text += &format!("Texte visible à l'image :\n{seen}");
        }
    }
    report.truncated = text.chars().count() > HEAD;
    report.excerpt = first_chars(text.trim(), HEAD).to_string();
    report
        .notes
        .push("La bande-son n'est pas transcrite : les paroles ne sont pas connues.".into());
    Ok(())
}

/// Les suites de caractères lisibles d'un contenu binaire.
fn strings(bytes: &[u8]) -> String {
    bytes
        .split(|b| !(b.is_ascii_graphic() || *b == b' '))
        .filter(|run| run.len() >= 6)
        .map(String::from_utf8_lossy)
        .collect::<Vec<_>>()
        .join("\n")
}

/// Le texte d'une image, avec la note qui dit d'où il vient.
fn recognised(path: &Path, report: &mut Report) -> Option<String> {
    let text = ocr(path);
    report.notes.push(match text {
        Some(_) => "Texte reconnu dans l'image :".into(),
        None => "Aucun texte reconnu dans l'image.".into(),
    });
    text
}

pub fn examine(path: &Path, name: &str) -> io::Result<Report> {
    let (sha256, size, lines) = measure(path)?;
    let start = read_at(path, 0, 64 * 1024)?;
    let extension = name
        .rsplit_once('.')
        .map_or(String::new(), |(_, e)| e.to_ascii_lowercase());
    let mut report = Report {
        size,
        sha256,
        ..Report::default()
    };

    let (kind, text) = if start.starts_with(b"%PDF") {
        ("document PDF".into(), pdf(path, &mut report)?)
    } else if start.starts_with(b"PK\x03\x04") {
        zip(path, &extension, &mut report)
    } else if start.starts_with(b"\x1f\x8b") || start.get(257..262) == Some(b"ustar") {
        (
            "archive tar ou gzip".into(),
            tool("tar", &["-tf"], path, &[]),
        )
    } else if start.starts_with(b"\x89PNG") {
        if let Some((width, height)) = png_size(&start) {
            report
                .notes
                .push(format!("Dimensions : {width} × {height}"));
        }
        ("image PNG".into(), recognised(path, &mut report))
    } else if is_text(&start) {
        let (excerpt, truncated) = text_excerpt(path, size)?;
        report.excerpt = excerpt;
        report.truncated = truncated;
        report.notes.push(format!("{lines} sauts de ligne"));
        report.kind = "fichier texte".into();
        return Ok(report);
    } else {
        let kind = tool("file", &["-b"], path, &[]).unwrap_or_else(|| "fichier binaire".into());
        let mime = tool("file", &["-b", "--mime-type"], path, &[]).unwrap_or_default();
        if mime.starts_with("image/") {
            report.kind = first_chars(&kind, 200).to_string();
            if let Some(text) = recognised(path, &mut report) {
                report.truncated = text.chars().count() > HEAD;
                report.excerpt = first_chars(&text, HEAD).to_string();
            }
            return Ok(report);
        }
        let marked = start.starts_with(b"\xff\xfe") || start.starts_with(b"\xfe\xff");
        if marked || mime.starts_with("text/") {
            let text = decode(&read_at(path, 0, OUTPUT)?);
            report.truncated = size > OUTPUT || text.chars().count() > HEAD;
            report.excerpt = first_chars(&text, HEAD).to_string();
            report.kind = "fichier texte".into();
            return Ok(report);
        }
        if mime.starts_with("video/") || mime.starts_with("audio/") {
            media(path, mime.starts_with("video/"), &mut report)?;
        } else {
            let found = strings(&read_at(path, 0, 1 << 20)?);
            if !found.is_empty() {
                report
                    .notes
                    .push("Extrait des chaînes lisibles du début.".into());
                report.excerpt = first_chars(&found, TAIL).to_string();
                report.truncated = true;
            }
        }
        report.kind = first_chars(&kind, 200).to_string();
        return Ok(report);
    };

    report.kind = kind;
    if report.kind.starts_with("image") && text.is_none() {
        return Ok(report);
    }
    match text {
        Some(text) => {
            report.truncated |= text.chars().count() > HEAD || text.len() as u64 >= OUTPUT - 4;
            report.excerpt = first_chars(&text, HEAD).to_string();
        }
        None => report.notes.push("Aucun texte extrait.".into()),
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn written(name: &str, content: &[u8]) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("lucas-exam-{name}-{}", std::process::id()));
        fs::write(&path, content).unwrap();
        path
    }

    fn examined(name: &str, content: &[u8]) -> Report {
        let path = written(name, content);
        let report = examine(&path, name).unwrap();
        fs::remove_file(path).unwrap();
        report
    }

    #[test]
    fn reads_a_whole_short_text() {
        let report = examined("a.txt", "été\nfin\n".as_bytes());
        assert_eq!(report.kind, "fichier texte");
        assert_eq!(report.excerpt, "été\nfin\n");
        assert!(!report.truncated);
        assert_eq!(report.size, 10);
        assert_eq!(report.notes, ["2 sauts de ligne"]);
        assert_eq!(
            examined("abc", b"abc").sha256,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn keeps_both_ends_of_a_long_text() {
        // Les deux chemins : lecture entière, puis lecture des seules extrémités.
        for middle in [HEAD * 2, HEAD * 20] {
            let text = format!("DEBUT{}FIN", "é".repeat(middle));
            let report = examined("long.txt", text.as_bytes());
            assert!(report.truncated, "{middle}");
            let head = format!("DEBUT{}", "é".repeat(HEAD - 5));
            let tail = format!("{}FIN", "é".repeat(TAIL - 3));
            let expected = format!("{head}\n\n[… passage non transmis …]\n\n{tail}");
            assert_eq!(report.excerpt, expected, "{middle}");
        }
    }

    #[test]
    fn does_not_treat_binary_as_text() {
        let report = examined("x.bin", b"\x00\x01secret-lisible\x00ab\x00");
        assert_ne!(report.kind, "fichier texte");
        assert!(report.excerpt.contains("secret-lisible"));
        assert!(!report.excerpt.contains("ab\n"));
        let mut png = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        png.extend([0, 0, 2, 0, 0, 0, 1, 0]);
        let report = examined("i.png", &png);
        assert_eq!(report.kind, "image PNG");
        assert_eq!(report.notes[0], "Dimensions : 512 × 256");
    }

    #[test]
    fn turns_document_xml_into_lines() {
        let xml = "<?xml?><w:p><w:t>A &amp; B</w:t></w:p><w:p><w:t>C</w:t></w:p><w:coupé";
        assert_eq!(strip_xml(xml), "A & B\nC");
        // Décodé une seule fois.
        assert_eq!(strip_xml("<a>&amp;lt; &lt;x&gt;</a>"), "&lt; <x>");
    }

    #[test]
    fn answers_a_deposited_file() {
        let root = std::env::temp_dir().join(format!("lucas-box-{}", std::process::id()));
        let job = root.join(format!("{JOB_PREFIX}1"));
        fs::create_dir_all(&job).unwrap();
        fs::write(job.join(FILE), "bonjour").unwrap();
        // Sans demande, le fichier n'est pas encore complet.
        process_pending(&root);
        assert!(!job.join(REPORT).exists());
        fs::write(job.join(REQUEST), r#"{"name":"a.txt"}"#).unwrap();
        process_pending(&root);
        let report: Report = serde_json::from_slice(&fs::read(job.join(REPORT)).unwrap()).unwrap();
        assert_eq!(report.excerpt, "bonjour");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reads_texts_that_are_not_utf8() {
        // « été à 5 € » tel qu'un tableur sous Windows l'exporte.
        assert_eq!(decode(b"\xe9t\xe9 \xe0 5 \x80"), "été à 5 €");
        assert_eq!(decode(b"\xff\xfeo\0u\0i\0"), "oui");
        assert_eq!(decode(b"\xfe\xff\0o\0k"), "ok");
        let report = examined("export.csv", b"nom;co\xfbt\nc\xe2ble;12\n");
        assert_eq!(report.excerpt, "nom;coût\ncâble;12\n");
    }

    #[test]
    fn says_when_a_tool_output_is_cut() {
        let path = written("cut", b"0123456789");
        let read = |limit| run_tool("cat", &[], &path, &[], limit);
        if Command::new("timeout")
            .arg("1")
            .arg("true")
            .status()
            .is_ok()
        {
            assert_eq!(read(4), Some(("0123".into(), true)));
            assert_eq!(read(10), Some(("0123456789".into(), false)));
        }
        fs::remove_file(path).unwrap();
    }
}
