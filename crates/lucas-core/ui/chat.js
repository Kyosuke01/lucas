'use strict';

// La discussion : envoi, réponses en arrière-plan, /compact, copie et modification.
// La réponse s'écrit côté serveur ; la page ne fait que la suivre. Recharger la
// page ou changer de discussion ne l'arrête donc pas.

// Réponses suivies : identifiant de discussion → { job, controller, stopped }.
const runs = new Map();
// Message envoyé en cours de modification : { id, index, draft }.
let editing = null;
let leaving = false;
// Réflexions que la personne a dépliées ou repliées. Sinon : ouvertes tant qu'elles s'écrivent.
const unfolded = new Map();
const MAX_THINKING = 20000;
// Images jointes à une demande, au plus.
const MAX_VIEWS = 8;

const byId = (id) => conversations.find((c) => c.id === id);
// Identifiant unique : aléatoire si le navigateur le permet, sinon un compteur.
let idCounter = 0;
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${(idCounter += 1)}`;
const count = (value) => value.toLocaleString('fr-FR');

// ── Ce que le modèle reçoit ──────────────────────────────────────────────────

// Un message envoyé, suivi des extraits de ses fichiers.
function modelText({ content, files = [] }) {
  const attached = files.map((file) => {
    const head = `--- Fichier joint : ${file.name} (${file.kind}, ${fileSize(file.size)}) ---`;
    const notes = [...(file.notes || [])];
    if (file.truncated) notes.push('Seul un extrait du fichier est fourni ci-dessous.');
    return [head, ...notes, file.excerpt, '--- Fin du fichier ---'].filter(Boolean).join('\n');
  });
  return [content, ...attached].filter(Boolean).join('\n\n');
}

// Après un /compact, le résumé remplace tout ce qui le précède.
function contextFor(messages) {
  let from = 0;
  let summary = '';
  messages.forEach((m, index) => {
    if (m.role === 'compact' && m.content && !m.job) {
      from = index + 1;
      summary = m.content;
    }
  });
  const history = messages.slice(from)
    .filter((m) => (m.role === 'user' || (m.role === 'assistant' && m.content)))
    .map((m) => {
      const attach = (m.files || []).filter((f) => f.views).map((f) => f.id);
      return { role: m.role, content: modelText(m), ...(attach.length && { attach }) };
    });
  if (summary) {
    history.unshift(
      { role: 'user', content: `Résumé de notre discussion jusqu'ici :\n${summary}` },
      { role: 'assistant', content: 'Bien noté, je repars de ce résumé.' },
    );
  }
  return history;
}

// Le texte est estimé : environ 4 caractères par jeton.
const estimateTokens = (history) => Math.ceil(history.reduce((sum, m) => sum + m.content.length, 0) / 4);

// ── Réponses ─────────────────────────────────────────────────────────────────

// Seul le dernier message illustré emporte ses images : elles pèsent lourd.
async function withImages(messages) {
  const last = messages.findLast((m) => m.attach);
  if (last) {
    const records = await Promise.all(last.attach.map((id) => previews.get(id)));
    const images = records.flatMap((record) => record?.views || []).slice(0, MAX_VIEWS);
    if (images.length) last.images = images;
  }
  for (const message of messages) delete message.attach;
  return messages;
}

// Certains modèles écrivent leur réflexion dans la réponse, entre deux balises.
function splitThought(raw) {
  const text = raw.trimStart();
  if (!text.startsWith('<think>')) return { thought: '', content: raw };
  const end = text.indexOf('</think>');
  if (end < 0) return { thought: text.slice(7), content: '' };
  return { thought: text.slice(7, end), content: text.slice(end + 8).trimStart() };
}

// Ajoute la réponse attendue à la discussion et la demande au serveur.
function request(conversation, role, model, history, extra = {}) {
  // La clé survit aux relectures depuis le stockage, contrairement à l'objet.
  const trace = { key: newId(), started: Date.now() };
  const reply = { role, content: '', job: newId(), model, trace, ...extra };
  conversation.messages.push(reply);
  persist(conversation);
  notice('');
  setActivity('');
  const body = { id: reply.job, model, messages: history, compact: role === 'compact' };
  void follow(conversation.id, reply.job, body);
  renderCommands();
  scrollDown();
}

const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Suit une réponse jusqu'au bout. Sans `body`, elle a déjà été demandée.
async function follow(id, job, body) {
  const run = { job, controller: new AbortController(), stopped: false };
  runs.set(id, run);
  // Réponse reprise : le temps passé page fermée fausserait la durée.
  if (!body) delete byId(id)?.messages.find((m) => m.job === job)?.trace?.started;
  companion.think();
  render();

  const replyOf = () => byId(id)?.messages.find((m) => m.job === job);
  let failure = '';
  let cancelled = false;
  let saved = 0;
  for (let attempt = 0; ; attempt += 1) {
    let text = '';
    let thinking = '';
    try {
      if (body?.messages.some((m) => m.attach)) {
        await withImages(body.messages);
        if (runs.get(id) !== run) return;
      }
      const response = body
        ? await api('/api/chat', 'POST', body, run.controller.signal)
        : await api(`/api/chat/${job}`, 'GET', undefined, run.controller.signal);
      await readLines(response, (data) => {
        if (data.cancelled) cancelled = true;
        text += data.message?.content || '';
        thinking += data.message?.thinking || '';
        const reply = replyOf();
        if (!reply) return;
        if (data.info && reply.trace) reply.trace.info = data.info;
        const split = splitThought(text);
        const thought = thinking + split.thought;
        if (thought) reply.thinking = thought.slice(-MAX_THINKING);
        if (!text && !thought) return paintReply(id, reply);
        reply.content = split.content;
        // La durée affichée est celle de la réflexion, avant le premier mot de la réponse.
        if (reply.content && reply.thinking) timed(reply);
        if (reply.content) companion.talk();
        paintReply(id, reply);
        // Une copie partielle survit même à un redémarrage du serveur.
        if (Date.now() - saved > 1000) {
          saved = Date.now();
          persist(byId(id));
        }
      });
      break;
    } catch (error) {
      if (leaving) return;
      if (run.controller.signal.aborted) break;
      // « Error » : le serveur a répondu. Sinon c'est la liaison, qu'on retente.
      if (error.name === 'Error' || attempt >= 5) {
        failure = readable(error);
        break;
      }
      body = null;
      await pause(1000 * (attempt + 1));
    }
  }
  // Remplacée entre-temps (message modifié) : ce suivi ne conclut plus rien.
  if (runs.get(id) !== run) return;
  runs.delete(id);
  conclude(id, job, { failure, cancelled: cancelled || run.stopped });
}

function timed({ trace }) {
  if (!trace?.started) return;
  trace.seconds = Math.round((Date.now() - trace.started) / 1000);
  delete trace.started;
}

function conclude(id, job, { failure, cancelled }) {
  const conversation = byId(id);
  const reply = conversation?.messages.find((m) => m.job === job);
  if (!reply) return render();
  delete reply.job;
  timed(reply);
  const shown = current === conversation && !$('chat').hidden;
  const remove = () => conversation.messages.splice(conversation.messages.indexOf(reply), 1);

  if (reply.role === 'compact') {
    reply.content = reply.content.split('</think>').at(-1).trim();
    const after = estimateTokens(contextFor(conversation.messages));
    reply.saved = reply.before - after;
    if (cancelled || failure || !reply.content || reply.saved <= 0) {
      remove();
      if (shown) {
        if (failure) notice(failure);
        else setActivity(cancelled ? 'Résumé annulé.' : 'Rien à gagner : la discussion est déjà courte.', true);
      }
    } else if (shown) {
      setActivity(`Discussion résumée : environ ${count(reply.saved)} jetons économisés.`);
    }
  } else {
    if (cancelled) reply.interrupted = true;
    if (failure) reply.error = failure;
    // Une réponse vide, sans rien à signaler, n'est pas conservée.
    // Une réflexion sans réponse se garde : sinon rien n'explique ce qui s'est passé.
    if (!reply.content && !cancelled && !failure) {
      if (reply.thinking) reply.error = 'Le modèle a réfléchi sans produire de réponse.';
      else remove();
    }
    if (shown) {
      if (cancelled) setActivity('Réponse interrompue.', true);
      else if (failure) setActivity('Erreur pendant la réponse.');
      else setActivity('Réponse terminée.', true);
    }
    // Après la première réponse, pour ne pas la retarder.
    if (reply.content && !failure && conversation.messages.length === 2) {
      void summarize(id, reply.model, conversation.messages[0].content || conversation.title);
    }
  }
  persist(conversation);
  if (!runs.size) {
    companion.done(Boolean(reply.content) && !failure);
    if (failure) companion.worry();
  }
  render();
  // Final : l'anneau se retrace une fois.
  if (shown && reply.content && reply.role === 'assistant') {
    $('messages').lastElementChild?.classList.add('done');
  }
}

// Reprend les réponses en cours : après un rechargement ou depuis un autre onglet.
function resume() {
  for (const conversation of conversations) {
    const reply = conversation.messages.find((m) => m.job);
    if (reply && runs.get(conversation.id)?.job !== reply.job) {
      void follow(conversation.id, reply.job, null);
    }
  }
}

function stopRun(id) {
  const run = runs.get(id);
  if (!run) return;
  run.stopped = true;
  api(`/api/chat/${run.job}`, 'DELETE')
    // La demande n'est pas encore arrivée : couper la liaison suffit.
    .catch(() => run.controller.abort());
}

// Oublie une réponse : sa discussion ou son message disparaît.
function dropRun(id) {
  stopRun(id);
  runs.delete(id);
}

window.addEventListener('pagehide', () => { leaving = true; });
window.addEventListener('pageshow', () => { leaving = false; });

// Le début du message sert de titre tant que l'IA n'a pas répondu (ou échoue).
async function summarize(id, model, message) {
  try {
    const { title } = await (await api('/api/title', 'POST', { model, message })).json();
    const conversation = byId(id);
    // Supprimée ou renommée entre-temps : ne rien écraser.
    if (!title || !conversation || conversation.renamed) return;
    conversation.title = title;
    persist(conversation);
    renderLocation();
    renderHistory();
  } catch { /* le titre provisoire reste */ }
}

// ── Envoi et commandes ───────────────────────────────────────────────────────

function send(text, files = []) {
  const model = $('model').value;
  if (!current) {
    const title = (text || files[0].name).slice(0, 60);
    current = { id: newId(), title, messages: [] };
    conversations.unshift(current);
  }
  const message = { role: 'user', content: text };
  if (files.length) message.files = files;
  current.messages.push(message);
  request(current, 'assistant', model, contextFor(current.messages));
}

const COMMANDS = [
  { name: '/compact', about: 'Résumer la discussion pour libérer la mémoire de LUCAS', run: compact },
];

function compact() {
  const history = current ? contextFor(current.messages) : [];
  if (history.length < 2) {
    setActivity('Rien à résumer pour le moment.', true);
    return;
  }
  // Les images ne se résument pas.
  for (const message of history) delete message.attach;
  request(current, 'compact', $('model').value, history, { before: estimateTokens(history) });
}

// Les commandes qui commencent comme la saisie, tant qu'elle n'est pas complète.
function suggestions(typed) {
  // Pendant une réponse, envoyer veut dire arrêter : aucune commande n'est proposée.
  if (!typed.startsWith('/') || (current && runs.has(current.id))) return [];
  return COMMANDS.filter((c) => c.name.startsWith(typed) && c.name !== typed.trim());
}

function complete(name) {
  $('input').value = name;
  renderCommands();
  updateSend();
  $('input').focus();
}

function renderCommands() {
  const typed = $('input').value;
  const matches = suggestions(typed);
  // Une commande reconnue se distingue du texte ordinaire.
  $('input').classList.toggle('command', COMMANDS.some((c) => c.name === typed.trim()));
  $('commands').hidden = !matches.length;
  $('commands').replaceChildren(...matches.map((command) => {
    const button = element('button');
    button.type = 'button';
    button.append(element('strong', '', command.name), element('span', 'muted', command.about));
    button.onclick = () => complete(command.name);
    return button;
  }));
}

$('composer').onsubmit = (event) => {
  event.preventDefault();
  if (current && runs.has(current.id)) return stopRun(current.id);
  const text = $('input').value.trim();
  if (!$('model').value || attachments.busy()) return;
  const command = COMMANDS.find((c) => c.name === text);
  if (!command && !text && !attachments.ready()) return;
  $('input').value = '';
  grow();
  renderCommands();
  if (command) command.run();
  else send(text, attachments.take());
  updateSend();
};

// La zone de saisie suit la longueur du message.
function grow() {
  const input = $('input');
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight}px`;
}

$('input').oninput = () => {
  grow();
  renderCommands();
  updateSend();
  companion.listen(Boolean($('input').value));
};
$('input').onkeydown = (event) => {
  // Tab ou Entrée complètent la commande proposée.
  const [suggested] = suggestions($('input').value);
  const completes = event.key === 'Tab' || event.key === 'Enter';
  if (suggested && completes && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    complete(suggested.name);
    return;
  }
  // Entrée envoie ; Maj+Entrée va à la ligne.
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (!(current && runs.has(current.id))) $('composer').requestSubmit();
};

function updateSend() {
  // Prévenir avant l'envoi quand le message quitte LUCAS.
  const [kind, provider] = $('model').value.split(':');
  $('external').hidden = kind !== '@api';
  $('external').textContent = `Les messages de ce modèle sont envoyés à l'API « ${provider} ».`;
  const busy = Boolean(current && runs.has(current.id));
  const button = $('send');
  button.setAttribute('aria-label', busy ? 'Arrêter' : 'Envoyer');
  button.querySelector('use').setAttribute('href', busy ? '#i-stop' : '#i-send');
  button.classList.toggle('stop', busy);
  const empty = !$('input').value.trim() && !attachments.ready();
  button.disabled = !busy && (empty || attachments.busy() || !$('model').value);
}

// ── Affichage des messages ───────────────────────────────────────────────────

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

// La réflexion du modèle, telle qu'il l'écrit.
function updateTrace(details, { job, thinking, trace, role, content }) {
  const writing = job && (role === 'compact' || !content);
  let title = writing ? 'Réflexion en cours…' : 'Réflexion';
  if (!writing && trace?.seconds !== undefined) title += ` · ${count(trace.seconds)} s`;
  details.querySelector('summary').textContent = title;
  const parts = [];
  if (trace?.info) parts.push(element('p', 'note', trace.info));
  if (thinking) parts.push(element('div', 'thought', thinking.trim()));
  // Un résumé en cours d'écriture se suit à la suite de la réflexion.
  if (role === 'compact' && job && content) {
    parts.push(element('p', 'note', 'Résumé :'), element('div', 'thought', content));
  }
  const body = details.querySelector('.trace-body');
  const follows = body.scrollHeight - body.scrollTop - body.clientHeight < 30;
  const position = body.scrollTop;
  body.replaceChildren(...parts);
  body.scrollTop = follows && job ? body.scrollHeight : position;
}

// Rien à montrer : pas de volet.
function traceNode(message) {
  if (!message.thinking && !message.trace?.info) return null;
  const details = element('details', 'trace');
  const summary = element('summary');
  const key = message.trace?.key ?? message;
  summary.onclick = () => unfolded.set(key, !details.open);
  details.append(summary, element('div', 'trace-body'));
  details.open = unfolded.get(key) ?? Boolean(message.job);
  updateTrace(details, message);
  return details;
}

function fill(node, message, state) {
  const body = element('div', 'markdown');
  body.append(...markdown.render(message.content));
  // Le signe est conservé : le recréer relancerait son animation à chaque mot.
  // L'état affiché pendant la génération reste en haut, à côté du logo.
  const mark = node.querySelector(':scope > .live') || liveMark();
  // Le déroulé aussi : il reste déplié, à la même hauteur de lecture.
  let trace = node.querySelector(':scope > details.trace');
  if (trace) updateTrace(trace, message);
  else trace = traceNode(message);
  const status = state ? element('p', 'state', state) : null;
  const wanted = [mark, status, trace, body].filter(Boolean);
  for (const child of [...node.children]) {
    if (!wanted.includes(child)) child.remove();
  }
  // Le déroulé n'est pas déplacé : un clic en cours serait perdu.
  if (trace?.parentElement === node) {
    // Déplacer le signe relancerait son animation.
    if (mark.parentElement !== node) node.prepend(mark);
    if (status) trace.before(status);
    node.append(body);
  } else {
    node.append(...wanted);
  }
}

function copyButton(text) {
  const button = iconButton('copy', 'Copier', async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      notice('Copie impossible dans ce navigateur.');
      return;
    }
    button.querySelector('use').setAttribute('href', '#i-check');
    setActivity('Copié.', true);
    setTimeout(() => button.querySelector('use').setAttribute('href', '#i-copy'), 1500);
  });
  return button;
}

function editForm(message, index) {
  const form = element('form', 'edit');
  const input = element('textarea');
  input.value = editing.draft;
  input.rows = Math.min(8, editing.draft.split('\n').length + 1);
  input.setAttribute('aria-label', 'Message modifié');
  input.oninput = () => { editing.draft = input.value; };
  const cancel = () => { editing = null; renderMessages(); };
  input.onkeydown = (event) => {
    if (event.key === 'Escape') cancel();
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  };
  const abandon = element('button', 'secondary', 'Annuler');
  abandon.type = 'button';
  abandon.onclick = cancel;
  const confirm = element('button', 'primary', 'Envoyer');
  const actions = element('div', 'edit-actions');
  actions.append(element('small', 'muted', 'Les messages suivants seront remplacés.'), abandon, confirm);
  form.append(input, actions);
  form.onsubmit = (event) => {
    event.preventDefault();
    const content = input.value.trim();
    if ((!content && !message.files) || !$('model').value) return;
    const conversation = current;
    dropRun(conversation.id);
    editing = null;
    const dropped = conversation.messages.splice(index, conversation.messages.length - index, { ...message, content });
    previews.remove(fileIds(dropped.slice(1)));
    request(conversation, 'assistant', $('model').value, contextFor(conversation.messages));
  };
  return form;
}

function compactNode(message) {
  const { content, job, saved } = message;
  const node = element('div', 'message compact');
  node.append(element('span', 'bubble command', '/compact'));
  if (job) {
    node.dataset.job = job;
    node.append(element('p', 'divider', 'Résumé de la discussion en cours…'));
  } else {
    const details = element('details', 'summary');
    details.append(element('summary', '', `Discussion résumée · environ ${count(saved)} jetons économisés`));
    const body = element('div', 'markdown');
    body.append(...markdown.render(content));
    details.append(body);
    node.append(details);
  }
  const trace = traceNode(message);
  if (trace) node.append(trace);
  return node;
}

function messageNode(message, index) {
  const { role, content, files = [], interrupted, error, job } = message;
  if (role === 'compact') return compactNode(message);
  const node = element('div', `message ${role}`);
  const actions = element('div', 'actions');
  if (role === 'user') {
    if (editing?.id === current.id && editing.index === index) {
      node.append(editForm(message, index));
      return node;
    }
    if (files.length) {
      const list = element('div', 'attached');
      list.append(...files.map(filePreview));
      node.append(list);
    }
    if (content) node.append(element('span', 'bubble', content));
    if (content) actions.append(copyButton(content));
    actions.append(iconButton('edit', 'Modifier', () => {
      editing = { id: current.id, index, draft: content };
      renderMessages();
      const input = $('messages').querySelector('.edit textarea');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }));
    node.append(actions);
    return node;
  }
  if (job) {
    node.dataset.job = job;
    node.classList.add(content ? 'writing' : 'thinking');
  }
  let state = '';
  if (job) state = content ? 'En train d\'écrire…' : 'En train de réfléchir…';
  fill(node, message, state);
  if (interrupted) node.append(element('p', 'cut', 'Réponse coupée à votre demande.'));
  if (error) node.append(element('p', 'failed', error));
  if (!job && content) {
    actions.append(copyButton(content));
    node.append(actions);
  }
  return node;
}

// Pendant la génération, seule la réponse en cours est redessinée, une fois par image.
const pending = new Set();
function paintReply(id, reply) {
  if (current?.id !== id || pending.has(reply.job)) return;
  const { job } = reply;
  pending.add(job);
  requestAnimationFrame(() => {
    pending.delete(job);
    const box = $('messages');
    const node = box.querySelector(`[data-job="${CSS.escape(job)}"]`);
    const latest = byId(id)?.messages.find((m) => m.job === job);
    if (!node || !latest) return;
    const follows = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    if (latest.role === 'compact') {
      const trace = node.querySelector(':scope > details.trace');
      if (trace) updateTrace(trace, latest);
      else node.append(...[traceNode(latest)].filter(Boolean));
    } else {
      const writing = Boolean(latest.content);
      const state = writing ? 'En train d\'écrire…' : 'En train de réfléchir…';
      fill(node, latest, state);
      node.classList.toggle('writing', writing);
      node.classList.toggle('thinking', !writing);
      if (writing) beat(node);
      $('status').textContent = state;
    }
    if (follows) box.scrollTop = box.scrollHeight;
  });
}

function scrollDown() {
  $('messages').scrollTop = $('messages').scrollHeight;
}

function welcomeMark() {
  const holder = element('div');
  holder.innerHTML = `<svg class="hello" viewBox="0 0 96 96" aria-hidden="true">
    <circle class="wave" cx="48" cy="48" r="22"/>
    <circle class="wave late" cx="48" cy="48" r="22"/>
    <circle class="track" cx="48" cy="48" r="36" pathLength="100"/>
    <g class="turn"><circle class="arc" cx="48" cy="48" r="22" pathLength="100"/></g>
    <circle class="ring" cx="48" cy="48" r="22" pathLength="100"/>
    <g class="orbit"><circle class="moon" cx="48" cy="12" r="3"/></g>
    <g class="orbit slow"><circle class="moon small" cx="48" cy="84" r="1.8"/></g>
    <circle class="core" cx="48" cy="48" r="9"/>
  </svg>`;
  return holder.firstElementChild;
}

function renderWelcome(box) {
  // Conservé d'un rendu à l'autre : le recréer relancerait son animation.
  let welcome = box.querySelector(':scope > .welcome');
  if (!welcome) {
    welcome = element('div', 'welcome');
    welcome.append(welcomeMark(), element('p', '', 'Que puis-je faire pour vous ?'));
    box.replaceChildren(welcome);
  }
  welcome.querySelector('small')?.remove();
  if (!$('model').value) {
    welcome.append(element('small', '', 'Aucun modèle disponible. Au premier démarrage, le téléchargement peut prendre plusieurs minutes ; sinon, ajoutez-en un dans « Modèles ».'));
  }
}

let shownConversation = null;

function renderMessages() {
  const box = $('messages');
  $('chat').classList.toggle('start', !current);
  const changed = shownConversation !== (current?.id ?? null);
  shownConversation = current?.id ?? null;
  if (changed) {
    editing = null;
    setActivity('');
  }
  if (!current) return renderWelcome(box);
  const follows = changed || box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  const position = box.scrollTop;
  // Un autre onglet ou une autre réponse redessine : la saisie en cours reste en main.
  const field = box.querySelector('.edit textarea');
  const caret = field && document.activeElement === field ? [field.selectionStart, field.selectionEnd] : null;
  box.replaceChildren(...current.messages.map(messageNode));
  const redrawn = box.querySelector('.edit textarea');
  if (caret && redrawn) {
    redrawn.focus();
    redrawn.setSelectionRange(...caret);
  }
  box.scrollTop = follows ? box.scrollHeight : position;
}
