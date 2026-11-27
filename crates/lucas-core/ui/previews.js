'use strict';

// Aperçus des fichiers joints. Les copies restent dans le navigateur (IndexedDB) :
// le serveur, lui, efface le fichier dès qu'il l'a examiné.

// Au-delà, seule la vignette est gardée.
const KEEP_BYTES = 200 * 1000 * 1000;
const VIEW_SIDE = 1024;
const VIDEO_VIEWS = 4;

const fileIds = (messages) => messages.flatMap((m) => (m.files || []).map((f) => f.id)).filter(Boolean);

// Ce que le navigateur sait montrer d'un fichier, d'après son type.
function previewKind(type = '') {
  const [family] = type.split('/');
  if (['image', 'video', 'audio'].includes(family)) return family;
  return type === 'application/pdf' ? 'pdf' : '';
}

const previews = (() => {
  // id → { blob, thumb, views }
  const memory = new Map();
  const urls = new Map();
  let opening = null;

  const database = () => {
    opening ??= new Promise((resolve) => {
      try {
        const request = indexedDB.open('lucas', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('files');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return opening;
  };

  // Indisponible ou plein : les aperçus ne durent alors que le temps de la page.
  async function use(mode, action) {
    const db = await database();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction('files', mode);
        const request = action(transaction.objectStore('files'));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async function put(id, record) {
    memory.set(id, record);
    await use('readwrite', (store) => store.put(record, id));
  }

  async function get(id) {
    if (!memory.has(id)) {
      const found = await use('readonly', (store) => store.get(id));
      if (found) memory.set(id, found);
    }
    return memory.get(id) || null;
  }

  function forget(id) {
    for (const url of Object.values(urls.get(id) || {})) {
      if (url) URL.revokeObjectURL(url);
    }
    urls.delete(id);
    memory.delete(id);
  }

  function remove(ids) {
    for (const id of ids) {
      forget(id);
      void use('readwrite', (store) => store.delete(id));
    }
  }

  function clear() {
    for (const id of [...memory.keys()]) forget(id);
    void use('readwrite', (store) => store.clear());
  }

  // Les adresses sont créées une fois : redessiner ne recharge pas les images.
  async function addresses(id) {
    if (!urls.has(id)) {
      const record = await get(id);
      if (!record) return null;
      if (!urls.has(id)) {
        urls.set(id, {
          blob: record.blob ? URL.createObjectURL(record.blob) : '',
          thumb: record.thumb ? URL.createObjectURL(record.thumb) : '',
        });
      }
    }
    return urls.get(id);
  }

  const known = (id) => urls.get(id);

  return { put, get, remove, clear, addresses, known };
})();

// ── Préparation ──────────────────────────────────────────────────────────────

function jpegBlob(base64) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: 'image/jpeg' });
}

// Image réduite, en JPEG base64 : ce que reçoit un modèle qui sait voir.
function shrink(source, width, height) {
  const scale = Math.min(1, VIEW_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  // La transparence deviendrait noire en JPEG.
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
}

function once(target, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('délai')), 8000);
    target.addEventListener(event, () => { clearTimeout(timer); resolve(); }, { once: true });
    target.addEventListener('error', () => { clearTimeout(timer); reject(new Error('illisible')); }, { once: true });
  });
}

// L'image elle-même, ou quelques instants d'une vidéo. Format inconnu : rien.
async function viewsOf(file) {
  const kind = previewKind(file.type);
  const views = [];
  try {
    if (kind === 'image') {
      const bitmap = await createImageBitmap(file);
      views.push(shrink(bitmap, bitmap.width, bitmap.height));
      bitmap.close();
    } else if (kind === 'video') {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      try {
        video.muted = true;
        video.preload = 'auto';
        video.src = url;
        await once(video, 'loadeddata');
        // Sans durée connue (enregistrements), seule la première image est prise.
        const timed = Number.isFinite(video.duration) && video.duration > 0;
        if (!timed) views.push(shrink(video, video.videoWidth, video.videoHeight));
        for (let index = 0; timed && index < VIDEO_VIEWS; index += 1) {
          const seeked = once(video, 'seeked');
          video.currentTime = (video.duration * (index + 0.5)) / VIDEO_VIEWS;
          await seeked;
          views.push(shrink(video, video.videoWidth, video.videoHeight));
        }
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  } catch { /* le texte reconnu reste */ }
  return views;
}

// ── Affichage ────────────────────────────────────────────────────────────────

// Format que le navigateur ne décode pas : la vignette du serveur le remplace.
function fallBack(image, address) {
  image.onerror = () => {
    image.onerror = null;
    if (address.thumb) image.src = address.thumb;
  };
}

function openViewer(file, address) {
  const kind = previewKind(file.type);
  const body = [];
  const media = (tag, src) => {
    const node = element(tag);
    node.src = src;
    if (tag !== 'img') node.controls = true;
    else {
      node.alt = file.name;
      fallBack(node, address);
    }
    return node;
  };
  if (kind === 'image' && address.blob) body.push(media('img', address.blob));
  else if (kind === 'video' && address.blob) body.push(media('video', address.blob));
  else if (address.thumb) body.push(media('img', address.thumb));
  if (kind === 'pdf' && address.blob) {
    // Le navigateur l'affiche avec sa propre visionneuse, dans un autre onglet.
    const link = element('a', 'link', 'Ouvrir le PDF');
    link.href = address.blob;
    link.target = '_blank';
    link.rel = 'noopener';
    body.push(link);
  }
  if (!body.length && file.excerpt) {
    if (/\.(md|markdown)$/i.test(file.name)) {
      const text = element('div', 'markdown');
      text.append(...markdown.render(file.excerpt));
      body.push(text);
    } else {
      body.push(element('pre', '', file.excerpt));
    }
    if (file.truncated) body.push(element('p', 'muted', 'Extrait du fichier.'));
  }
  $('viewer-title').textContent = file.name;
  $('viewer-body').replaceChildren(...body);
  $('viewer').showModal();
}

// Fermée, la visionneuse ne doit plus rien jouer.
globalThis.document?.getElementById('viewer')?.addEventListener('close', () => {
  document.getElementById('viewer-body').replaceChildren();
});

function thumbnail(file, address) {
  const kind = previewKind(file.type);
  if (kind === 'audio' && address.blob) {
    const audio = element('audio');
    audio.controls = true;
    audio.src = address.blob;
    return audio;
  }
  let picture = null;
  if (kind === 'image' && address.blob) {
    picture = element('img');
    picture.src = address.blob;
    fallBack(picture, address);
  } else if (address.thumb) {
    picture = element('img');
    picture.src = address.thumb;
  } else if (kind === 'video' && address.blob) {
    picture = element('video');
    picture.muted = true;
    picture.preload = 'metadata';
    picture.src = `${address.blob}#t=0.5`;
  }
  if (!picture) return null;
  if (picture.tagName === 'IMG') picture.alt = file.name;
  const button = element('button', `thumb ${kind}`);
  button.type = 'button';
  button.title = `${file.name} · ${fileSize(file.size)}`;
  button.setAttribute('aria-label', `Voir ${file.name}`);
  button.append(picture);
  button.onclick = () => openViewer(file, address);
  return button;
}

// L'aperçu d'un fichier envoyé, ou sa simple étiquette à défaut.
function filePreview(file) {
  const holder = element('div', 'preview');
  const chip = fileChip(file);
  if (file.excerpt) {
    chip.classList.add('openable');
    chip.onclick = () => openViewer(file, previews.known(file.id) || {});
  }
  const draw = (address) => {
    // Sans vignette ni texte, un PDF gardé reste ouvrable.
    if (address?.blob && previewKind(file.type) === 'pdf') {
      chip.classList.add('openable');
      chip.onclick = () => openViewer(file, address);
    }
    holder.replaceChildren(thumbnail(file, address || {}) || chip);
  };
  const known = file.id && previews.known(file.id);
  draw(known);
  if (file.id && !known) void previews.addresses(file.id).then((address) => address && draw(address));
  return holder;
}
