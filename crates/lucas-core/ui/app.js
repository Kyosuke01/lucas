'use strict';

const $ = (id) => document.getElementById(id);
const STORE = 'lucas.conversations';
const MODEL_STORE = 'lucas.model';

// Le stockage peut être indisponible (navigation privée) : l'interface reste utilisable.
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Navigation privée : ignoré. Stockage plein : le dire, sinon tout serait perdu en silence.
    if (error.name === 'QuotaExceededError') notice('Stockage du navigateur plein : supprimez d\'anciennes discussions.');
  }
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
  button.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-${icon}"/></svg>`;
  button.onclick = onClick;
  return button;
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

function drawer(open) {
  document.body.classList.toggle('open', open);
  $('menu').setAttribute('aria-expanded', String(open));
}

// Une seule fenêtre : explication (un bouton) ou confirmation (deux).
function modal({ title, text, ok = 'Compris', cancel = false, danger = false }) {
  const dialog = $('dialog');
  $('dialog-title').textContent = title;
  $('dialog-body').replaceChildren(...[text].flat().map((line) => element('p', '', line)));
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
      'La température va de 0 à 2. Elle règle le choix du mot suivant : le modèle prend les mots les plus probables, ou accepte d\'autres mots.',
      '0 : toujours le mot le plus probable. Réponses identiques d\'un essai à l\'autre, parfois répétitives.',
      '0,2 à 0,6 : très régulier et sûr. Convient au code, aux faits et aux extractions.',
      '0,8 : valeur conseillée, un bon équilibre pour la plupart des usages.',
      '1 à 1,4 : tournures plus variées, moins prévisibles.',
      '1,5 à 2 : très inventif, mais risque de contresens et de phrases incohérentes.',
      'Par défaut : on garde le réglage du modèle.',
    ],
  },
  context: {
    title: 'Mémoire de la conversation',
    text: [
      "C'est la longueur de conversation que LUCAS garde en tête.",
      'Longue : il se souvient mieux d\'un échange étendu, mais consomme plus de mémoire et ralentit.',
      'Normale convient à un usage courant. Par défaut : on garde le réglage du modèle.',
    ],
  },
};

// Curseurs à paliers. Chaque palier affiche sa valeur exacte ; la pastille « Recommandé » marque le réglage conseillé.
const DIALS = {
  temperature: {
    // De 0 à 2 par pas de 0,1 ; seules les valeurs rondes portent une étiquette.
    stops: Array.from({ length: 21 }, (_, i) => Math.round(i) / 10),
    recommended: 0.8,
    format: (v) => (Math.round(v * 10) % 5 === 0 ? v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) : ''),
    help: (v) => {
      if (v === 0) return '0 : toujours le mot le plus probable, réponses identiques d\'un essai à l\'autre.';
      if (v <= 0.6) return `${v.toLocaleString('fr-FR')} : très régulier et sûr. Code, faits, extractions.`;
      if (v <= 0.9) return `${v.toLocaleString('fr-FR')} : équilibre conseillé pour la plupart des usages.`;
      if (v <= 1.4) return `${v.toLocaleString('fr-FR')} : tournures plus variées, moins prévisibles.`;
      return `${v.toLocaleString('fr-FR')} : très inventif, risque de phrases incohérentes.`;
    },
  },
  context: {
    stops: [1024, 2048, 4096, 8192, 16384, 32768, 65536],
    recommended: 4096,
    format: (v) => `${v / 1024}k`,
    help: (v) => `Environ ${Math.round(v * 0.75).toLocaleString('fr-FR')} mots gardés en mémoire.`,
  },
};

for (const [name, dial] of Object.entries(DIALS)) {
  const range = $(`${name}-range`);
  const ticks = $(`${name}-ticks`);
  const last = dial.stops.length - 1;
  range.min = 0;
  range.max = last;
  range.step = 1;
  ticks.replaceChildren(...dial.stops.map((value, i) => {
    const tick = element('span', 'tick');
    tick.style.left = `${(i / last) * 100}%`;
    tick.dataset.index = i;
    if (value === dial.recommended) {
      tick.classList.add('recommended');
      tick.title = 'Valeur conseillée';
    }
    const label = dial.format(value);
    if (label) tick.append(element('span', 'value', label));
    tick.onclick = () => { range.value = i; paint(name); };
    return tick;
  }));
  range.oninput = () => paint(name);
}

// Affiche la valeur sélectionnée et met en évidence son palier.
function paint(name) {
  const dial = DIALS[name];
  const index = Number($(`${name}-range`).value);
  const value = dial.stops[index];
  for (const tick of $(`${name}-ticks`).children) tick.classList.toggle('on', Number(tick.dataset.index) === index);
  $(`${name}-words`).textContent = dial.help(value);
}

// Pose une valeur enregistrée sur le palier le plus proche.
function setDials(temperature, context) {
  for (const [name, value] of [['temperature', temperature], ['context', context]]) {
    const { stops, recommended } = DIALS[name];
    const target = value ?? recommended;
    const nearest = stops.reduce((best, stop, i) => (Math.abs(stop - target) < Math.abs(stops[best] - target) ? i : best), 0);
    $(`${name}-range`).value = nearest;
    paint(name);
  }
}
const readDial = (name) => DIALS[name].stops[Number($(`${name}-range`).value)];
const readTemperature = () => readDial('temperature');
const readContext = () => readDial('context');
for (const button of document.querySelectorAll('[data-help]')) {
  button.onclick = () => modal(HELP[button.dataset.help]);
}

function notice(message) {
  $('notice').textContent = message || '';
  $('notice').hidden = !message;
  if (message) companion.worry();
}

// ── API ─────────────────────────────────────────────────────────────────────

async function api(path, method, body, signal) {
  const response = await fetch(path, {
    method: method || 'GET',
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
      let data;
      // Une ligne coupée par une interruption : l'erreur qui la suit compte.
      try { data = JSON.parse(line); } catch { continue; }
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
  if (view === 'models') void refreshModels();
  if (view === 'settings') void openSettings();
}

// Titre de la page et repère « vous êtes ici » dans la barre latérale.
function renderLocation() {
  const onModels = !$('models').hidden;
  const onSettings = !$('settings').hidden;
  const onChat = !$('chat').hidden;
  let title = current?.title;
  if (onModels) title = 'Modèles';
  if (onSettings) title = 'Réglages';
  // Un titre n'est jamais vide pour les lecteurs d'écran ; sans objet, il est masqué.
  $('title').textContent = title || 'LUCAS';
  $('info-toggle').hidden = !(onChat && current);
  if (!onChat) setInfo(false);
  $('title').classList.toggle('sr', !title);
  $('show-models').classList.toggle('current', onModels);
  $('show-settings').classList.toggle('current', onSettings);
  $('new-chat').classList.toggle('current', onChat && !current);
}

// Ligne d'état sous la discussion : pour le résultat final, qui peut disparaître.
let activityTimer;
function setActivity(text, fade = false) {
  clearTimeout(activityTimer);
  $('activity').textContent = text;
  $('status').textContent = text;
  if (fade) activityTimer = setTimeout(() => { $('activity').textContent = ''; }, 3000);
}

function render() {
  renderLocation();
  renderHistory();
  renderMessages();
  updateSend();
  renderDetails();
}

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
  else if (missing) {
    listError = missing;
    notice(missing);
  }
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
  const close = () => { item.replaceChildren(...original); void refreshModels(); };
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
  void refreshModels();
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
  void refreshModels();
}

$('add').onsubmit = (event) => {
  event.preventDefault();
  openCatalog(false);
  const model = $('add-name').value.trim();
  if (model) void pull(model);
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
  void refreshModels();
};

// ── Réglages ────────────────────────────────────────────────────────────────
let savedTimer;

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
  setDials(data.temperature, data.context);
  settings = data;
  renderDetails();
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
  void refreshSystem();
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
  const providers = [...$('providers').children].map((row) =>
    Object.fromEntries([...row.querySelectorAll('input')].map((i) => [i.name, i.value.trim()])));
  notice('');
  $('saved').textContent = '';
  try {
    const body = {
      system_prompt: $('system-prompt').value,
      temperature: readTemperature(),
      context: readContext(),
      providers,
    };
    fillSettings(await (await api('/api/settings', 'PUT', body)).json());
    // Le message de réussite disparaît seul ; les erreurs restent affichées.
    $('saved').textContent = 'Enregistré';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { $('saved').textContent = ''; }, 2500);
    void refreshModels();
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
  if (!(await confirmDelete('Tout effacer ?', 'Toutes les discussions et tous les groupes de ce navigateur seront supprimés.'))) return;
  for (const id of runs.keys()) dropRun(id);
  previews.clear();
  conversations = [];
  groups = [];
  current = null;
  save(STORE, conversations);
  saveGroups();
  render();
};

// ── Démarrage ───────────────────────────────────────────────────────────────

$('model').onchange = () => { save(MODEL_STORE, $('model').value); updateSend(); };
$('new-chat').onclick = () => { current = null; show('chat'); render(); $('input').focus(); };
$('show-models').onclick = () => { show('models'); render(); };
$('show-settings').onclick = () => { show('settings'); render(); };

// ── Volet d'infos de la discussion ─────────────────────────────────────────
// Sans réglage explicite, Ollama utilise une fenêtre de 4 096 jetons : c'est la base du calcul.
const ASSUMED_CONTEXT = 4096;
// Réglages enregistrés, pour afficher ceux qui s'appliquent à la discussion.
let settings = null;

function setInfo(open) {
  document.body.classList.toggle('info-open', open);
  $('info-toggle').setAttribute('aria-expanded', String(open));
  if (open) renderDetails();
}
$('info-toggle').onclick = () => setInfo(!document.body.classList.contains('info-open'));

// Replie la barre latérale de gauche (bureau uniquement).
$('sidebar-toggle').onclick = () => {
  const closed = document.body.classList.toggle('sidebar-closed');
  $('sidebar-toggle').setAttribute('aria-expanded', String(!closed));
  $('sidebar-toggle').setAttribute('aria-label', closed ? 'Afficher la barre latérale' : 'Replier la barre latérale');
};

function renderDetails() {
  const body = $('details-body');
  if (!current) {
    body.replaceChildren(element('p', 'muted', 'Ouvrez une discussion pour voir ses paramètres.'));
    return;
  }
  const tokens = estimateTokens(contextFor(current.messages));
  const limit = settings?.context ?? ASSUMED_CONTEXT;
  const percent = Math.min(100, Math.round((tokens / limit) * 100));

  const fill = element('span');
  fill.style.width = `${percent}%`;
  if (percent >= 80) fill.classList.add('high');
  const meter = element('div', 'meter');
  meter.setAttribute('role', 'meter');
  meter.setAttribute('aria-label', 'Remplissage de la fenêtre de contexte');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', '100');
  meter.setAttribute('aria-valuenow', String(percent));
  meter.append(fill);

  const bar = element('div', 'context-bar');
  bar.append(element('span', 'pct', `${percent} %`), meter);
  body.replaceChildren(element('p', 'context-head', 'Contexte'), bar);
}

// Volet sans réglages en cas d'échec : le calcul reste sur la valeur par défaut.
function loadSettings() {
  return api('/api/settings')
    .then((response) => response.json())
    .then((data) => { settings = data; renderDetails(); })
    .catch(() => {});
}
$('menu').onclick = (event) => { event.stopPropagation(); drawer(true); };
$('close-menu').onclick = () => drawer(false);
document.querySelector('main').addEventListener('click', () => drawer(false));
window.addEventListener('focus', refreshModels);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') drawer(false);
});
window.addEventListener('storage', (event) => {
  if (event.key !== STORE && event.key !== GROUP_STORE) return;
  conversations = load(STORE, []);
  groups = load(GROUP_STORE, []);
  current = conversations.find((c) => c.id === current?.id) || null;
  render();
  resume();
});

// Les autres scripts de l'interface sont alors chargés.
window.addEventListener('DOMContentLoaded', () => {
  applyTheme(load(THEME_STORE, 'light dark'));
  render();
  resume();
  void refreshModels();
  void refreshSystem();
  void loadSettings();
});
