'use strict';

const $ = (id) => document.getElementById(id);
const STORE = 'lucas.conversations';
const MODEL_STORE = 'lucas.model';

// Le stockage peut être indisponible (navigation privée) : l'interface reste utilisable.
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignoré */ }
}

// Chaque écriture repart du stockage : un autre onglet a pu le modifier.
function persist(conversation) {
  const stored = load(STORE, []);
  const index = stored.findIndex((c) => c.id === conversation.id);
  if (index < 0) stored.unshift(conversation);
  else stored[index] = conversation;
  save(STORE, stored);
}

let conversations = load(STORE, []);
let current = null;     // conversation affichée, ou null pour une nouvelle
let generation = null;  // { controller, conversation } pendant une réponse

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function iconButton(icon, label, onClick) {
  const button = element('button', 'ghost');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = `<svg class="icon"><use href="#i-${icon}"/></svg>`;
  button.onclick = onClick;
  return button;
}

function mark() {
  const holder = element('span');
  holder.innerHTML = '<svg class="icon mark" aria-hidden="true"><use href="#i-mark"/></svg>';
  return holder.firstChild;
}

// Signe animé d'une réponse. Au repos, il est identique au signe fixe.
// `pathLength=100` permet d'exprimer les arcs en pourcentage du cercle.
function liveMark() {
  const holder = element('span');
  holder.innerHTML = `<svg class="live" viewBox="0 0 24 24" aria-hidden="true">
    <circle class="halo" cx="12" cy="12" r="9"/>
    <circle class="ring" cx="12" cy="12" r="9" pathLength="100"/>
    <circle class="comet tail" cx="12" cy="12" r="9" pathLength="100"/>
    <circle class="comet head" cx="12" cy="12" r="9" pathLength="100"/>
    <g class="inner"><circle class="guide" cx="12" cy="12" r="6.2" pathLength="100"/></g>
    <g class="orbit"><circle class="satellite" cx="12" cy="0.6" r="1.3"/></g>
    <circle class="core" cx="12" cy="12" r="3.5"/>
  </svg>`;
  return holder.firstChild;
}

// Une onde part du cœur à l'arrivée du texte, au plus quatre fois par seconde.
let lastBeat = 0;
function beat(message) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (performance.now() - lastBeat < 260) return;
  lastBeat = performance.now();
  message.querySelector('.live .halo')?.animate(
    [{ transform: 'scale(.4)', opacity: 0.9 }, { transform: 'scale(1.75)', opacity: 0 }],
    { duration: 760, easing: 'cubic-bezier(.2,.7,.3,1)' },
  );
  message.querySelector('.live .core')?.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.38)', offset: 0.3 }, { transform: 'scale(1)' }],
    { duration: 420, easing: 'ease-out' },
  );
}

function drawer(open) {
  document.body.classList.toggle('open', open);
  $('menu').setAttribute('aria-expanded', String(open));
}

// Une seule fenêtre : explication (un bouton) ou confirmation (deux).
function modal({ title, text, ok = 'Compris', cancel = false, danger = false }) {
  const dialog = $('dialog');
  $('dialog-title').textContent = title;
  $('dialog-body').replaceChildren(...[].concat(text).map((line) => element('p', '', line)));
  $('dialog-ok').textContent = ok;
  $('dialog-ok').classList.toggle('destructive', danger);
  $('dialog-cancel').hidden = !cancel;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
  });
}

const confirmDelete = (title, text) => modal({ title, text, ok: 'Supprimer', cancel: true, danger: true });

const HELP = {
  temperature: {
    title: 'Température',
    text: [
      'Elle règle la part de hasard dans les réponses.',
      'Basse (0 à 0,3) : réponses précises et régulières, pour du code ou des faits.',
      'Élevée (0,8 à 2) : réponses variées et créatives, mais moins fiables.',
      'Laissez vide pour garder le réglage du modèle.',
    ],
  },
  context: {
    title: 'Contexte',
    text: [
      "C'est la quantité de texte que le modèle garde en tête, mesurée en jetons (un jeton vaut environ trois quarts d'un mot).",
      'Plus il est grand, plus LUCAS se souvient d\'une longue conversation, mais plus il consomme de mémoire et ralentit.',
      '4096 convient à un usage courant. Laissez vide pour garder le réglage du modèle.',
    ],
  },
};
for (const button of document.querySelectorAll('[data-help]')) {
  button.onclick = () => modal(HELP[button.dataset.help]);
}

function notice(message) {
  $('notice').textContent = message || '';
  $('notice').hidden = !message;
  if (message) companion.worry();
}

// ── API ─────────────────────────────────────────────────────────────────────

async function api(path, method = 'GET', body, signal) {
  const response = await fetch(path, {
    method,
    signal,
    headers: body && { 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Erreur ${response.status}`);
  }
  return response;
}

// `fetch` et le flux lèvent des erreurs en anglais.
const readable = (error) => (error.name === 'Error' ? error.message : 'La connexion avec LUCAS a été interrompue.');

// Lit une réponse « une ligne JSON par étape ».
async function readLines(response, onLine) {
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    buffer += value || '';
    const lines = buffer.split('\n');
    buffer = done ? '' : lines.pop();
    for (const line of lines.filter((l) => l.trim())) {
      const data = JSON.parse(line);
      if (data.error) throw new Error(data.error);
      onLine(data);
    }
    if (done) return;
  }
}

// ── Vues ────────────────────────────────────────────────────────────────────

function show(view) {
  for (const id of ['chat', 'models', 'settings']) $(id).hidden = view !== id;
  drawer(false);
  notice('');
  if (view === 'models') refreshModels();
  if (view === 'settings') openSettings();
}

// Titre de la page et repère « vous êtes ici » dans la barre latérale.
function renderLocation() {
  const onModels = !$('models').hidden;
  const onSettings = !$('settings').hidden;
  const onChat = !$('chat').hidden;
  $('title').textContent = onModels ? 'Modèles' : onSettings ? 'Réglages' : current?.title || '';
  $('show-models').classList.toggle('current', onModels);
  $('show-settings').classList.toggle('current', onSettings);
  $('new-chat').classList.toggle('current', onChat && !current);
}

// Texte brut, sauf les blocs de code. Jamais de HTML venant du modèle.
function fill(node, text) {
  const body = [];
  text.split(/^```/m).forEach((part, index) => {
    if (index % 2) {
      body.push(element('pre', '', part.replace(/^[\w+-]*\n/, '').replace(/\n+$/, '')));
    } else if (part.trim()) {
      // Les sauts de ligne autour d'un bloc de code créeraient de grands vides.
      body.push(element('p', '', part.replace(/^\n+|\n+$/g, '')));
    }
  });
  // Le signe est conservé : le recréer relancerait son animation à chaque mot.
  node.replaceChildren(node.querySelector(':scope > .live') || liveMark(), ...body);
}

function messageNode({ role, content }) {
  const node = element('div', `message ${role}`);
  if (role === 'user') node.append(element('span', '', content));
  else fill(node, content);
  return node;
}

function renderMessages() {
  const box = $('messages');
  $('chat').classList.toggle('start', !current);
  if (!current) {
    const welcome = element('div', 'welcome');
    welcome.append(mark(), element('p', '', 'Que puis-je faire pour vous ?'));
    if (!$('model').value) {
      welcome.append(element('small', '', 'Aucun modèle disponible. Au premier démarrage, le téléchargement peut prendre plusieurs minutes ; sinon, ajoutez-en un dans « Modèles ».'));
    }
    box.replaceChildren(welcome);
    return;
  }
  box.replaceChildren(...current.messages.map(messageNode));
  if (generation?.conversation === current) {
    const writing = current.messages.at(-1).content;
    box.lastElementChild.classList.add(writing ? 'writing' : 'thinking');
  }
  box.scrollTop = box.scrollHeight;
}

function renderHistory() {
  $('history').replaceChildren(...conversations.map((conversation) => {
    const active = conversation === current && !$('chat').hidden;
    const entry = element('div', active ? 'entry current' : 'entry');
    const open = element('button', 'row', conversation.title);
    open.type = 'button';
    if (conversation === current) open.setAttribute('aria-current', 'true');
    open.onclick = () => { current = conversation; show('chat'); render(); };
    entry.append(open, iconButton('trash', 'Supprimer la conversation', async () => {
      if (!(await confirmDelete('Supprimer la discussion ?', `« ${conversation.title} » sera définitivement effacée.`))) return;
      if (generation?.conversation === conversation) generation.controller.abort();
      conversations = conversations.filter((c) => c !== conversation);
      if (current === conversation) current = null;
      save(STORE, load(STORE, []).filter((c) => c.id !== conversation.id));
      render();
    }));
    return entry;
  }));
}

function render() {
  renderLocation();
  renderHistory();
  renderMessages();
  updateSend();
}

function updateSend() {
  // Prévenir avant l'envoi quand le message quitte LUCAS.
  const [kind, provider] = $('model').value.split(':');
  $('external').hidden = kind !== '@api';
  $('external').textContent = `Les messages de ce modèle sont envoyés à l'API « ${provider} ».`;
  const button = $('send');
  button.setAttribute('aria-label', generation ? 'Arrêter' : 'Envoyer');
  button.querySelector('use').setAttribute('href', generation ? '#i-stop' : '#i-send');
  button.disabled = !generation && (!$('input').value.trim() || !$('model').value);
}

// ── Conversation ────────────────────────────────────────────────────────────

async function send(text) {
  const model = $('model').value;
  if (!current) {
    current = { id: `${Date.now()}-${Math.random()}`, title: text.slice(0, 60), messages: [] };
    conversations.unshift(current);
  }
  const conversation = current;
  conversation.messages.push({ role: 'user', content: text });
  // Enregistré tout de suite : fermer l'onglet ne perd pas le message.
  persist(conversation);
  const history = conversation.messages.filter((m) => m.content);
  const reply = { role: 'assistant', content: '' };
  conversation.messages.push(reply);
  const controller = new AbortController();
  generation = { controller, conversation };
  notice('');
  $('status').textContent = 'LUCAS répond';
  companion.think();
  render();

  try {
    const response = await api('/api/chat', 'POST', { model, messages: history }, controller.signal);
    await readLines(response, (data) => {
      reply.content += data.message?.content || '';
      if (reply.content) companion.talk();
      if (current !== conversation) return;
      const box = $('messages');
      const follow = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
      const message = box.lastElementChild;
      fill(message, reply.content);
      if (reply.content) {
        message.classList.replace('thinking', 'writing');
        beat(message);
      }
      if (follow) box.scrollTop = box.scrollHeight;
    });
  } catch (error) {
    if (error.name !== 'AbortError') notice(readable(error));
  }

  // Une réponse restée vide n'est pas conservée.
  if (!reply.content) conversation.messages.splice(conversation.messages.indexOf(reply), 1);
  generation = null;
  // Après une erreur, il reste inquiet.
  if ($('notice').hidden) companion.done(Boolean(reply.content));
  else { companion.done(false); companion.worry(); }
  if (conversations.includes(conversation)) persist(conversation);
  // Après la première réponse, pour ne pas la retarder.
  if (reply.content && conversation.messages.length === 2) summarize(conversation, model, text);
  $('status').textContent = 'Réponse terminée';
  render();
  // Final : l'anneau se retrace une fois.
  if (current === conversation && reply.content) {
    $('messages').lastElementChild?.classList.add('done');
  }
}

// Le début du message sert de titre tant que l'IA n'a pas répondu (ou échoue).
async function summarize(conversation, model, message) {
  try {
    const { title } = await (await api('/api/title', 'POST', { model, message })).json();
    // Supprimée entre-temps : ne pas la faire réapparaître.
    if (!title || !load(STORE, []).some((c) => c.id === conversation.id)) return;
    conversation.title = title;
    const shown = conversations.find((c) => c.id === conversation.id);
    if (shown) shown.title = title;
    persist(shown || conversation);
    renderLocation();
    renderHistory();
  } catch { /* le titre provisoire reste */ }
}

$('composer').onsubmit = (event) => {
  event.preventDefault();
  if (generation) return generation.controller.abort();
  const text = $('input').value.trim();
  if (!text || !$('model').value) return;
  $('input').value = '';
  grow();
  send(text);
};

// La zone de saisie suit la longueur du message.
function grow() {
  const input = $('input');
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight}px`;
}

$('input').oninput = () => { grow(); updateSend(); companion.listen(Boolean($('input').value)); };
$('input').onkeydown = (event) => {
  // Entrée envoie ; Maj+Entrée va à la ligne.
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (!generation) $('composer').requestSubmit();
};

// ── Modèles ─────────────────────────────────────────────────────────────────

// « :latest » est ajouté par Ollama aux noms sans version : inutile à l'écran.
const label = (name) => name.replace(/:latest$/, '');

const size = (bytes) => `${(bytes / 1e9).toFixed(1).replace('.', ',')} Go`;

let listError = '';
let retry;

async function refreshModels() {
  clearTimeout(retry);
  let data;
  try {
    data = await (await api('/api/models')).json();
  } catch (error) {
    listError = readable(error);
    notice(listError);
    retry = setTimeout(refreshModels, 5000);
    return;
  }
  // N'efface que sa propre erreur.
  if (listError && $('notice').textContent === listError) notice('');
  listError = '';
  const remote = data.remote;
  const missing = data.unreachable.length ? `API injoignable : ${data.unreachable.join(', ')}` : '';
  if (missing && !$('settings').hidden) notice(missing);
  else if (missing) notice((listError = missing));
  installedNames = data.models.map((m) => m.name);
  renderCatalog();
  // Premier démarrage : attendre la fin du téléchargement du modèle.
  if (!data.models.length) retry = setTimeout(refreshModels, 5000);
  const select = $('model');
  // Le choix mémorisé prime : une API revenue retrouve sa sélection.
  const wanted = load(MODEL_STORE, data.default);
  select.replaceChildren(...data.models.map((m) => new Option(m.alias || label(m.name), m.name)));
  for (const provider of new Set(remote.map((m) => m.provider))) {
    const group = element('optgroup');
    group.label = provider;
    group.append(...remote.filter((m) => m.provider === provider).map((m) => new Option(m.name, m.id)));
    select.append(group);
  }
  const ids = [...select.options].map((o) => o.value);
  const choice = [wanted, data.default].find((id) => ids.includes(id));
  if (choice) select.value = choice;
  if (!ids.length) select.add(new Option('Aucun modèle installé', ''));

  // Ne pas reconstruire la liste pendant qu'un nom est en cours de saisie.
  if ($('installed').querySelector('form')) return updateSend();
  $('installed').replaceChildren(...data.models.map((model) => {
    const item = element('li');
    const name = element('span', 'name', model.alias || label(model.name));
    if (model.alias) name.append(element('span', 'muted', ` (${label(model.name)})`));
    if (model.name === select.value) name.append(element('span', 'badge', 'utilisé'));
    item.append(
      name,
      element('span', 'muted', size(model.size)),
      iconButton('edit', `Renommer ${model.name}`, () => editName(item, model)),
      iconButton('trash', `Supprimer ${model.name}`, () => removeModel(model.name)),
    );
    return item;
  }), ...remote.map((model) => {
    const item = element('li');
    item.append(element('span', 'name', model.name), element('span', 'muted', `API ${model.provider}`));
    return item;
  }));
  if (!data.models.length && !remote.length) {
    $('installed').append(element('li', 'muted', 'Aucun modèle pour le moment.'));
  }
  if (!current) renderMessages();
  updateSend();
}

// La ligne devient un champ : Entrée valide, Échap annule. Seul le nom affiché
// change ; un champ vide rend au modèle son propre nom.
function editName(item, { name: model, alias }) {
  // Une seule ligne en cours d'édition : l'autre retrouve son contenu.
  $('installed').querySelector('form button[data-cancel]')?.click();
  const original = [...item.childNodes];
  const form = element('form');
  const input = element('input');
  input.value = alias || label(model);
  input.maxLength = 40;
  input.setAttribute('aria-label', `Nom affiché pour ${model}`);
  input.autocomplete = 'off';
  const confirmButton = iconButton('check', 'Valider', null);
  confirmButton.type = 'submit';
  const close = () => { item.replaceChildren(...original); refreshModels(); };
  const abandon = () => { notice(''); close(); };
  const cancel = iconButton('close', 'Annuler', abandon);
  cancel.dataset.cancel = '';
  form.append(input, confirmButton, cancel);
  form.onkeydown = (event) => { if (event.key === 'Escape') abandon(); };
  form.onsubmit = async (event) => {
    event.preventDefault();
    confirmButton.disabled = true;
    notice('');
    try {
      await api('/api/models/rename', 'POST', { model, name: input.value.trim() });
    } catch (error) {
      close();
      notice(readable(error));
      return;
    }
    close();
  };
  item.replaceChildren(form);
  input.focus();
  input.select();
}

async function removeModel(name) {
  if (!(await confirmDelete('Supprimer le modèle ?', `${label(name)} devra être retéléchargé pour être réutilisé.`))) return;
  notice('');
  try {
    await api('/api/models', 'DELETE', { model: name });
  } catch (error) {
    notice(readable(error));
  }
  refreshModels();
}

// Tailles et mémoire conseillées : ordres de grandeur.
const CATALOG = [
  ['gemma2:2b', 'Léger', 1.6, 6],
  ['llama3.2:3b', 'Équilibré', 2.0, 8],
  ['mistral:7b', 'À l\'aise en français', 4.1, 10],
  ['llama3.1:8b', 'Polyvalent', 4.9, 12],
  ['qwen2.5:7b', 'Bon en code', 4.7, 10],
];
let installedNames = [];
let totalRam = null;
let downloading = false;

let highlighted = -1;

// Suggestions encore absentes, filtrées par la saisie.
function renderCatalog() {
  const typed = $('add-name').value.trim().toLowerCase();
  const matches = CATALOG.filter(([name, about]) =>
    !installedNames.includes(name) && `${name} ${about}`.toLowerCase().includes(typed));
  highlighted = Math.min(highlighted, matches.length - 1);
  $('catalog').replaceChildren(...matches.map(([name, about, gigabytes, ram], index) => {
    const item = element('li');
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(index === highlighted));
    item.dataset.name = name;
    const heavy = totalRam && ram * 1e9 > totalRam * 1.1;
    const text = element('span', 'name', name);
    text.append(element('span', 'muted detail', heavy ? 'Trop lourd ici' : about));
    item.append(text, element('span', 'muted', `${String(gigabytes).replace('.', ',')} Go`));
    // `pointerdown` précède la perte du focus, qui fermerait la liste.
    item.onpointerdown = (event) => { event.preventDefault(); choose(name); };
    return item;
  }));
  if (!matches.length) $('catalog').append(element('li', 'muted', 'Aucune suggestion : le nom saisi sera recherché.'));
}

function openCatalog(open) {
  $('catalog').hidden = !open;
  $('add-name').setAttribute('aria-expanded', String(open));
  if (open) renderCatalog();
  else highlighted = -1;
}

function choose(name) {
  $('add-name').value = name;
  openCatalog(false);
}

$('add-name').onfocus = $('add-name').onclick = () => openCatalog(true);
$('add-name').onblur = () => openCatalog(false);
$('add-name').oninput = () => openCatalog(true);
$('add-name').onkeydown = (event) => {
  const options = [...$('catalog').querySelectorAll('[role=option]')];
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (step && options.length) {
    event.preventDefault();
    if ($('catalog').hidden) openCatalog(true);
    highlighted = (highlighted + step + options.length) % options.length;
    renderCatalog();
    $('catalog').children[highlighted].scrollIntoView({ block: 'nearest' });
  } else if (event.key === 'Enter' && !$('catalog').hidden && highlighted >= 0) {
    event.preventDefault();
    choose($('catalog').children[highlighted].dataset.name);
  } else if (event.key === 'Escape') {
    openCatalog(false);
  }
};

async function pull(model) {
  if (downloading) return;
  downloading = true;
  renderCatalog();
  const bar = $('progress').querySelector('progress');
  $('progress').hidden = false;
  $('progress').scrollIntoView({ block: 'nearest' });
  bar.removeAttribute('value');
  $('progress-label').textContent = `Préparation de ${model}`;
  notice('');
  try {
    let success = false;
    await readLines(await api('/api/models/pull', 'POST', { model }), (data) => {
      success = data.status === 'success';
      if (!data.total) return;
      const percent = Math.floor(((data.completed || 0) / data.total) * 100);
      bar.value = percent;
      // Ollama compte fichier par fichier, pas pour le modèle entier.
      $('progress-label').textContent = `${model} : fichier en cours, ${percent} % de ${size(data.total)}`;
    });
    if (!success) throw new Error(`Le téléchargement de ${model} s'est interrompu.`);
    $('add-name').value = '';
  } catch (error) {
    notice(readable(error));
  }
  $('progress').hidden = true;
  downloading = false;
  refreshModels();
}

$('add').onsubmit = (event) => {
  event.preventDefault();
  openCatalog(false);
  const model = $('add-name').value.trim();
  if (model) pull(model);
};

let importFile = null;

function selectFile(file) {
  if (file && !/\.gguf$/i.test(file.name)) {
    notice('Seuls les fichiers .gguf peuvent être importés.');
    return;
  }
  notice('');
  importFile = file;
  $('import-confirm').hidden = !file;
  $('drop-title').textContent = file ? file.name : 'Déposez un fichier .gguf';
  $('drop-detail').textContent = file ? size(file.size) : 'ou cliquez pour le choisir sur cet ordinateur';
  $('import-name').value = file
    ? file.name.replace(/\.gguf$/i, '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+/, '').slice(0, 80)
    : '';
}

$('import-file').onchange = () => { selectFile($('import-file').files[0] || null); $('import-file').value = ''; };
$('import-cancel').onclick = () => selectFile(null);
// Sans cela, un fichier lâché à côté remplacerait la page.
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault());
$('drop').ondragover = () => $('drop').classList.add('over');
$('drop').ondragleave = () => $('drop').classList.remove('over');
$('drop').ondrop = (event) => {
  $('drop').classList.remove('over');
  if (!$('import-button').disabled) selectFile(event.dataTransfer.files[0] || null);
};

$('import').onsubmit = async (event) => {
  event.preventDefault();
  const file = importFile;
  const name = $('import-name').value.trim();
  if (!file || !name) return;
  const button = $('import-button');
  button.disabled = true;
  button.textContent = 'Import en cours';
  notice('');
  try {
    const response = await fetch(`/api/models/import?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Erreur ${response.status}`);
    selectFile(null);
  } catch (error) {
    notice(readable(error));
  }
  button.disabled = false;
  button.textContent = 'Importer';
  refreshModels();
};

// ── Réglages ────────────────────────────────────────────────────────────────

function providerRow({ name = '', url = '', has_key: hasKey = false } = {}) {
  const row = element('div', 'provider');
  const field = (key, placeholder, value, type = 'text') => {
    const input = element('input');
    Object.assign(input, { name: key, type, placeholder, value, autocomplete: 'off' });
    input.setAttribute('aria-label', placeholder);
    return input;
  };
  row.append(
    field('name', 'Nom', name),
    field('url', 'https://serveur/v1', url),
    field('key', hasKey ? 'Clé enregistrée' : 'Clé (facultative)', '', 'password'),
    iconButton('trash', 'Retirer cette API', () => row.remove()),
  );
  // La clé n'est jamais reportée vers un autre nom ou une autre adresse.
  if (hasKey) {
    row.oninput = () => {
      const [first, second, secret] = row.querySelectorAll('input');
      const moved = first.value.trim() !== name || second.value.trim() !== url;
      secret.placeholder = moved ? 'Clé à ressaisir' : 'Clé enregistrée';
    };
  }
  return row;
}

function fillSettings(data) {
  $('system-prompt').value = data.system_prompt;
  $('temperature').value = data.temperature ?? '';
  $('context').value = data.context ?? '';
  $('providers').replaceChildren(...data.providers.map(providerRow));
}

async function refreshSystem() {
  try {
    const data = await (await api('/api/system')).json();
    totalRam = data.ram_total;
    const memory = data.ram_total
      ? `${size(data.ram_available)} libres sur ${size(data.ram_total)}`
      : 'inconnue';
    const loaded = data.loaded?.map((m) =>
      $('model').querySelector(`option[value="${CSS.escape(m.name)}"]`)?.text || label(m.name));
    const rows = [
      ['Mémoire (Docker)', memory],
      ['Processeurs', data.cpus ?? 'inconnu'],
      ['Modèle en mémoire', data.ollama ? loaded.join(', ') || 'Aucun' : 'Moteur injoignable'],
      ['Version', data.version],
    ];
    $('system').replaceChildren(...rows.flatMap(([term, value]) => [element('dt', '', term), element('dd', '', value)]));
    renderCatalog();
  } catch (error) {
    notice(readable(error));
  }
}

async function openSettings() {
  $('saved').textContent = '';
  refreshSystem();
  // Tant que les réglages ne sont pas lus, enregistrer les effacerait.
  const button = $('preferences').querySelector('[type=submit]');
  button.disabled = true;
  try {
    fillSettings(await (await api('/api/settings')).json());
    button.disabled = false;
  } catch (error) {
    notice(readable(error));
  }
}

// Onglets : un seul panneau visible par groupe.
for (const list of document.querySelectorAll('[role=tablist]')) {
  const tabs = [...list.querySelectorAll('[role=tab]')];
  for (const tab of tabs) {
    tab.onclick = () => {
      for (const other of tabs) {
        other.setAttribute('aria-selected', String(other === tab));
        $(other.dataset.panel).hidden = other !== tab;
      }
      // « Enregistrer » ne concerne pas l'onglet Système.
      if (list.closest('#settings')) $('preferences').hidden = tab.dataset.panel === 'tab-system';
      notice('');
    };
  }
}

$('add-provider').onclick = () => $('providers').append(providerRow());

$('preferences').onsubmit = async (event) => {
  event.preventDefault();
  const number = (id) => ($(id).value === '' ? null : Number($(id).value));
  const providers = [...$('providers').children].map((row) =>
    Object.fromEntries([...row.querySelectorAll('input')].map((i) => [i.name, i.value.trim()])));
  notice('');
  $('saved').textContent = '';
  try {
    const body = {
      system_prompt: $('system-prompt').value,
      temperature: number('temperature'),
      context: number('context'),
      providers,
    };
    fillSettings(await (await api('/api/settings', 'PUT', body)).json());
    $('saved').textContent = 'Enregistré';
    refreshModels();
  } catch (error) {
    notice(readable(error));
  }
};

const THEME_STORE = 'lucas.theme';
function applyTheme(theme) {
  document.documentElement.style.colorScheme = theme;
  $('theme').value = theme;
}
$('theme').onchange = () => { save(THEME_STORE, $('theme').value); applyTheme($('theme').value); };

$('export').onclick = () => {
  const link = element('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(load(STORE, []), null, 2)], { type: 'application/json' }));
  link.download = 'lucas-conversations.json';
  link.click();
  URL.revokeObjectURL(link.href);
};

$('purge').onclick = async () => {
  if (!(await confirmDelete('Tout effacer ?', 'Toutes les discussions de ce navigateur seront supprimées.'))) return;
  generation?.controller.abort();
  conversations = [];
  current = null;
  save(STORE, conversations);
  renderHistory();
  renderMessages();
};

// ── Démarrage ───────────────────────────────────────────────────────────────

$('model').onchange = () => { save(MODEL_STORE, $('model').value); updateSend(); };
$('new-chat').onclick = () => { current = null; show('chat'); render(); $('input').focus(); };
$('show-models').onclick = () => { show('models'); render(); };
$('show-settings').onclick = () => { show('settings'); render(); };
$('menu').onclick = (event) => { event.stopPropagation(); drawer(true); };
$('close-menu').onclick = () => drawer(false);
document.querySelector('main').addEventListener('click', () => drawer(false));
window.addEventListener('focus', refreshModels);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') drawer(false);
});
window.addEventListener('storage', (event) => {
  if (event.key !== STORE || generation) return;
  conversations = load(STORE, []);
  current = conversations.find((c) => c.id === current?.id) || null;
  render();
});

applyTheme(load(THEME_STORE, 'light dark'));
render();
refreshModels();
refreshSystem();
