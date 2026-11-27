'use strict';

// Pièces jointes : chaque fichier est envoyé au bac à sable, qui l'examine. Seul
// son rapport est gardé et transmis au modèle.

function fileSize(bytes) {
  const units = ['o', 'ko', 'Mo', 'Go', 'To'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${units[unit]}`;
}

// Taille courte, pour l'affichage : « 10Ko », « 1,6Mo ».
function shortSize(bytes) {
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const digits = value < 10 ? 1 : 0;
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: digits })}${units[unit]}`;
}

// Nom court : le début, puis l'extension. « Bon anniversa….mp4 ».
function shortName(name, limit = 24) {
  if (name.length <= limit) return name;
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot) : '';
  const head = name.slice(0, limit - extension.length - 2).trimEnd();
  return `${head}…${extension}`;
}

// Seuls le nom et la taille sont affichés : le reste est pour le modèle, pas pour la page.
function fileLabel(name, size) {
  return `${shortName(name)} • ${shortSize(size)}`;
}

function fileChip(file) {
  const chip = element('span', 'chip');
  chip.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-clip"/></svg>';
  chip.append(element('span', 'name', fileLabel(file.name, file.size)));
  chip.title = file.sha256 ? `${file.name} · SHA-256 : ${file.sha256}` : file.name;
  return chip;
}

const attachments = (() => {
  // { id, file, name, size, type, url, xhr, progress, views, report, error }
  let items = [];

  function paint(item) {
    if (item.error) return item.error;
    if (item.report && item.views) return shortSize(item.size);
    return item.progress < 1 ? `Envoi : ${Math.floor(item.progress * 100)} %` : 'Examen en cours…';
  }

  // L'image choisie se voit avant même la fin de son examen.
  function picture(item) {
    const kind = previewKind(item.type);
    const preview = item.report?.preview;
    if (preview && !item.thumb) item.thumb = URL.createObjectURL(jpegBlob(preview));
    const { excerpt, truncated } = item.report || {};
    return thumbnail(
      { name: item.name, size: item.size, type: item.type, excerpt, truncated },
      { blob: kind === 'pdf' && !item.report ? '' : item.url, thumb: item.thumb },
    );
  }

  function discard(item) {
    URL.revokeObjectURL(item.url);
    if (item.thumb) URL.revokeObjectURL(item.thumb);
  }

  function render() {
    $('attachments').hidden = !items.length;
    $('attachments').replaceChildren(...items.map((item) => {
      const chip = element('span', item.error ? 'chip failed' : 'chip');
      item.status = element('small', 'muted', paint(item));
      const remove = iconButton('close', `Retirer ${item.name}`, () => {
        item.xhr.abort();
        discard(item);
        items = items.filter((other) => other !== item);
        render();
      });
      const shown = !item.error && picture(item);
      if (shown) chip.append(shown);
      // Une fois examiné, seuls le nom et la taille restent affichés.
      const done = Boolean(item.report && item.views);
      const label = done ? fileLabel(item.name, item.size) : shortName(item.name);
      chip.append(element('span', 'name', label), done ? '' : item.status, remove);
      return chip;
    }));
    updateSend();
  }

  function add(file) {
    const xhr = new XMLHttpRequest();
    const item = {
      id: newId(), file, name: file.name, size: file.size, type: file.type,
      url: URL.createObjectURL(file), xhr, progress: 0,
    };
    items.push(item);
    void viewsOf(file).then((views) => {
      item.views = views;
      render();
    });
    // `fetch` ne dit pas où en est un envoi.
    xhr.upload.onprogress = (event) => {
      item.progress = event.total ? event.loaded / event.total : 0;
      if (item.status) item.status.textContent = paint(item);
    };
    xhr.onload = () => {
      let answer = {};
      try { answer = JSON.parse(xhr.responseText); } catch { /* réponse illisible */ }
      if (xhr.status === 200) item.report = answer;
      else item.error = answer.error || `Erreur ${xhr.status}`;
      render();
    };
    xhr.onerror = () => {
      item.error = 'Envoi interrompu.';
      render();
    };
    xhr.open('POST', `/api/files?name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.send(file);
    render();
  }

  const busy = () => items.some((item) => !item.error && !(item.report && item.views));
  const ready = () => items.some((item) => item.report);

  // Les rapports prêts partent avec le message ; les échecs sont oubliés.
  // L'aperçu va dans IndexedDB : le stockage des discussions est trop petit.
  function take() {
    const files = items.filter((item) => item.report).map((item) => {
      const { preview, ...report } = item.report;
      void previews.put(item.id, {
        blob: previewKind(item.type) && item.size <= KEEP_BYTES ? item.file : null,
        thumb: preview ? jpegBlob(preview) : null,
        views: item.views,
      });
      return { ...report, id: item.id, name: item.name, type: item.type, views: item.views.length };
    });
    items.forEach(discard);
    items = [];
    render();
    return files;
  }

  const addAll = (list) => {
    if ($('chat').hidden) return;
    for (const file of list) add(file);
  };
  $('attach').onclick = () => $('files').click();
  $('files').onchange = () => { addAll($('files').files); $('files').value = ''; };
  $('chat').addEventListener('drop', (event) => {
    $('chat').classList.remove('over');
    addAll(event.dataTransfer.files);
  });
  $('chat').addEventListener('dragover', (event) => {
    if (event.dataTransfer.types.includes('Files')) $('chat').classList.add('over');
  });
  $('chat').addEventListener('dragleave', (event) => {
    if (!$('chat').contains(event.relatedTarget)) $('chat').classList.remove('over');
  });
  $('input').addEventListener('paste', (event) => {
    // Un tableur copie du texte et son image : le texte prime.
    const { files, types } = event.clipboardData;
    if (!files.length || types.includes('text/plain')) return;
    event.preventDefault();
    addAll(event.clipboardData.files);
  });
  // Un envoi, contrairement à une réponse, s'arrête avec la page.
  window.addEventListener('beforeunload', (event) => {
    if (busy()) event.preventDefault();
  });

  return { busy, ready, take };
})();
