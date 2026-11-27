'use strict';

// Barre latérale : discussions épinglées, groupes, glisser-déposer.

const GROUP_STORE = 'lucas.groups';
const CHAT_TYPE = 'application/x-lucas-chat';
const GROUP_TYPE = 'application/x-lucas-group';

let groups = load(GROUP_STORE, []); // [{ id, name, collapsed }]
let menuOf = null; // identifiant de ce dont le menu est ouvert
let renaming = null; // identifiant de ce qui est en cours de renommage
let dragging = false;
let stale = false; // un rendu a été différé pendant qu'un menu était ouvert

const saveGroups = () => save(GROUP_STORE, groups);
const saveOrder = () => save(STORE, conversations);

function zoneOf(conversation) {
  if (conversation.pinned) return 'pinned';
  return groups.some((g) => g.id === conversation.group) ? conversation.group : 'loose';
}

// Range une discussion dans une zone, avant `beforeId` ou à la fin.
function moveConversation(id, zone, beforeId) {
  const conversation = byId(id);
  if (!conversation || beforeId === id) return;
  conversation.pinned = zone === 'pinned';
  // Épinglée, elle garde son groupe : elle y retournera.
  if (zone === 'loose') delete conversation.group;
  else if (zone !== 'pinned') conversation.group = zone;
  conversations.splice(conversations.indexOf(conversation), 1);
  const before = conversations.findIndex((c) => c.id === beforeId);
  conversations.splice(before < 0 ? conversations.length : before, 0, conversation);
  saveOrder();
  renderHistory();
}

function moveGroup(id, beforeId) {
  const group = groups.find((g) => g.id === id);
  if (!group || beforeId === id) return;
  groups.splice(groups.indexOf(group), 1);
  const before = groups.findIndex((g) => g.id === beforeId);
  groups.splice(before < 0 ? groups.length : before, 0, group);
  saveGroups();
  renderHistory();
}

function createGroup(conversationId) {
  const group = { id: newId(), name: 'Nouveau groupe', collapsed: false };
  groups.push(group);
  saveGroups();
  if (conversationId) moveConversation(conversationId, group.id);
  renaming = group.id;
  renderHistory();
}

async function deleteGroup(group) {
  const ok = await modal({
    title: 'Supprimer le groupe ?',
    text: `« ${group.name} » sera retiré. Ses discussions sont conservées.`,
    ok: 'Supprimer',
    cancel: true,
    danger: true,
  });
  if (!ok) return;
  groups = groups.filter((g) => g.id !== group.id);
  for (const conversation of conversations) {
    if (conversation.group === group.id) delete conversation.group;
  }
  saveGroups();
  saveOrder();
  renderHistory();
}

async function deleteConversation(conversation) {
  if (!(await confirmDelete('Supprimer la discussion ?', `« ${conversation.title} » sera définitivement effacée.`))) return;
  dropRun(conversation.id);
  previews.remove(fileIds(conversation.messages));
  conversations = conversations.filter((c) => c.id !== conversation.id);
  if (current?.id === conversation.id) current = null;
  save(STORE, load(STORE, []).filter((c) => c.id !== conversation.id));
  render();
}

$('new-group').onclick = () => createGroup();

// ── Menus et renommage ───────────────────────────────────────────────────────

function closeMenu() {
  menuOf = null;
  document.querySelector('.menu')?.remove();
  if (stale) setTimeout(renderHistory);
}
document.addEventListener('pointerdown', (event) => {
  if (menuOf && !event.target.closest('.menu, .more')) closeMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuOf) closeMenu();
});

function menuItem(icon, text, onClick, danger = false) {
  const item = element('button', danger ? 'danger' : '');
  item.type = 'button';
  item.setAttribute('role', 'menuitem');
  item.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-${icon}"/></svg>`;
  item.append(element('span', '', text));
  item.onclick = () => { closeMenu(); onClick(); };
  return item;
}

function conversationMenu(conversation) {
  const zone = zoneOf(conversation);
  const rename = () => { renaming = conversation.id; renderHistory(); };
  return [
    conversation.pinned
      ? menuItem('pin', 'Désépingler', () => moveConversation(conversation.id, conversation.group || 'loose',
        conversations.find((c) => c.id !== conversation.id)?.id))
      : menuItem('pin', 'Épingler', () => moveConversation(conversation.id, 'pinned')),
    // Même rangement qu'au glisser-déposer, pour le clavier et le tactile.
    ...groups.filter((g) => g.id !== zone).map((g) =>
      menuItem('folder', `Ranger dans « ${g.name} »`, () => moveConversation(conversation.id, g.id))),
    ...(conversation.group ? [menuItem('close', 'Retirer du groupe', () => moveConversation(conversation.id, 'loose'))] : []),
    menuItem('plus', 'Nouveau groupe', () => createGroup(conversation.id)),
    menuItem('edit', 'Renommer', rename),
    menuItem('trash', 'Supprimer', () => void deleteConversation(conversation), true),
  ];
}

function moreButton(id, label, items) {
  const button = iconButton('more', label, () => {
    if (menuOf === id) return closeMenu();
    closeMenu();
    menuOf = id;
    const menu = element('div', 'menu');
    menu.setAttribute('role', 'menu');
    menu.append(...items());
    button.parentElement.append(menu);
    button.setAttribute('aria-expanded', 'true');
    menu.querySelector('button').focus();
    menu.scrollIntoView({ block: 'nearest' });
  });
  button.classList.add('more');
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  return button;
}

// Champ à la place du nom : Entrée valide, Échap annule, sortir du champ valide aussi.
function renameField(value, label, apply) {
  const input = element('input', 'rename');
  input.value = value;
  input.maxLength = 80;
  input.setAttribute('aria-label', label);
  let done = false;
  const finish = (keep) => {
    if (done) return;
    done = true;
    const text = input.value.trim();
    renaming = null;
    if (keep && text && text !== value) apply(text);
    renderLocation();
    renderHistory();
  };
  input.onkeydown = (event) => {
    if (event.key === 'Enter') { event.preventDefault(); finish(true); }
    if (event.key === 'Escape') finish(false);
  };
  input.onblur = () => finish(true);
  queueMicrotask(() => { input.focus(); input.select(); });
  return input;
}

// Points animés : LUCAS est en train d'écrire dans cette discussion.
function typing() {
  const dots = element('span', 'typing');
  dots.setAttribute('role', 'img');
  dots.setAttribute('aria-label', 'LUCAS est en train d\'écrire');
  dots.title = 'LUCAS est en train d\'écrire';
  dots.append(element('i'), element('i'), element('i'));
  return dots;
}

// ── Glisser-déposer ──────────────────────────────────────────────────────────

function draggable(node, type, id) {
  node.draggable = true;
  node.ondragstart = (event) => {
    event.dataTransfer.setData(type, id);
    event.dataTransfer.effectAllowed = 'move';
    dragging = true;
    // Différé : changer la page pendant `dragstart` annulerait le geste.
    setTimeout(() => $('history').classList.add('dragging'));
  };
  node.ondragend = () => {
    dragging = false;
    renderHistory();
  };
}

function clearMarks() {
  for (const node of $('history').querySelectorAll('.drop-in, .drop-before')) {
    node.classList.remove('drop-in', 'drop-before');
  }
}

// `section` reçoit une discussion ; un groupe reçoit aussi un autre groupe.
function dropZone(section, zone) {
  const isGroup = zone !== 'pinned' && zone !== 'loose';
  const accepts = (event) => event.dataTransfer.types.includes(CHAT_TYPE)
    || (isGroup && event.dataTransfer.types.includes(GROUP_TYPE));
  section.ondragover = (event) => {
    if (!accepts(event)) return;
    event.preventDefault();
    clearMarks();
    const entry = event.target.closest('.entry:not(.group-head)');
    if (event.dataTransfer.types.includes(GROUP_TYPE)) section.classList.add('drop-before');
    else if (entry) entry.classList.add('drop-before');
    else section.classList.add('drop-in');
  };
  section.ondragleave = (event) => {
    if (!section.contains(event.relatedTarget)) clearMarks();
  };
  section.ondrop = (event) => {
    if (!accepts(event)) return;
    event.preventDefault();
    clearMarks();
    dragging = false;
    const group = event.dataTransfer.getData(GROUP_TYPE);
    if (group) return moveGroup(group, zone);
    const before = event.target.closest('.entry:not(.group-head)')?.dataset.id;
    moveConversation(event.dataTransfer.getData(CHAT_TYPE), zone, before);
  };
}

// ── Affichage ────────────────────────────────────────────────────────────────

function conversationEntry(conversation) {
  const active = conversation.id === current?.id && !$('chat').hidden;
  const entry = element('div', active ? 'entry current' : 'entry');
  entry.dataset.id = conversation.id;
  if (renaming === conversation.id) {
    entry.append(renameField(conversation.title, 'Nouveau titre de la discussion', (title) => {
      const latest = byId(conversation.id);
      if (!latest) return;
      latest.title = title;
      latest.renamed = true;
      persist(latest);
    }));
    return entry;
  }
  draggable(entry, CHAT_TYPE, conversation.id);
  const open = element('button', 'row');
  open.type = 'button';
  open.append(element('span', 'name', conversation.title));
  if (runs.has(conversation.id)) open.append(typing());
  if (conversation.id === current?.id) open.setAttribute('aria-current', 'true');
  open.onclick = () => { current = byId(conversation.id); show('chat'); render(); scrollDown(); };
  entry.append(open, moreButton(conversation.id, 'Options de la discussion', () => conversationMenu(conversation)));
  return entry;
}

function section(zone, head, items) {
  const node = element('div', `zone zone-${zone === 'pinned' || zone === 'loose' ? zone : 'group'}`);
  if (!items.length) node.classList.add('empty');
  dropZone(node, zone);
  node.append(...(head ? [head] : []), ...items.map(conversationEntry));
  return node;
}

function groupSection(group, items) {
  const head = element('div', 'entry group-head');
  if (renaming === group.id) {
    head.append(renameField(group.name, 'Nom du groupe', (name) => {
      group.name = name;
      saveGroups();
    }));
  } else {
    draggable(head, GROUP_TYPE, group.id);
    const toggle = element('button', 'row');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(!group.collapsed));
    toggle.innerHTML = '<svg class="icon chevron" aria-hidden="true"><use href="#i-chevron"/></svg>';
    toggle.append(element('span', 'name', group.name));
    // Repliée, la rubrique signale encore qu'une réponse s'écrit.
    if (group.collapsed && items.some((c) => runs.has(c.id))) toggle.append(typing());
    toggle.onclick = () => {
      group.collapsed = !group.collapsed;
      saveGroups();
      renderHistory();
    };
    head.append(toggle, moreButton(group.id, 'Options du groupe', () => [
      menuItem('edit', 'Renommer', () => { renaming = group.id; renderHistory(); }),
      menuItem('trash', 'Supprimer le groupe', () => void deleteGroup(group), true),
    ]));
  }
  const node = section(group.id, head, group.collapsed ? [] : items);
  if (!items.length && !group.collapsed) node.append(element('p', 'hint-drop muted', 'Glissez une discussion ici'));
  return node;
}

function renderHistory() {
  // Redessiner pendant un geste ou une saisie les interromprait.
  const field = $('history').querySelector('.rename');
  if (dragging || (field && renaming && document.activeElement === field)) return;
  // Un menu ouvert reste ouvert ; le rendu aura lieu à sa fermeture.
  stale = Boolean(menuOf);
  if (stale) return;
  $('history').classList.remove('dragging');
  const inZone = (zone) => conversations.filter((c) => zoneOf(c) === zone);
  const label = (text) => element('p', 'label-zone', text);
  const pinned = inZone('pinned');
  const loose = inZone('loose');
  const sorted = pinned.length || groups.length;
  $('history').replaceChildren(
    section('pinned', label('Épinglées'), pinned),
    ...groups.map((group) => groupSection(group, inZone(group.id))),
    section('loose', sorted ? label('Discussions') : null, loose),
  );
}
