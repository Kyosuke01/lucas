'use strict';

// chat.js est un script de page : on le charge avec le strict nécessaire autour.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function page(conversations = []) {
  const calls = { persisted: 0, activity: [], notices: [] };
  const context = {
    conversations,
    current: conversations[0] || null,
    window: { addEventListener() {} },
    $: () => ({ hidden: true, classList: { add() {} } }),
    companion: { done() {}, worry() {} },
    persist: () => { calls.persisted += 1; },
    render: () => {},
    setActivity: (text) => calls.activity.push(text),
    notice: (text) => calls.notices.push(text),
    fileSize: (bytes) => `${bytes} o`,
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'chat.js'), 'utf8');
  vm.runInContext(source, context);
  const run = (code) => vm.runInContext(code, context);
  // Les valeurs viennent d'un autre « realm » : on les copie pour les comparer.
  const plain = (code) => JSON.parse(run(`JSON.stringify(${code})`));
  return { context, calls, run, plain };
}

const user = (content, files) => ({ role: 'user', content, ...(files && { files }) });
const assistant = (content, extra) => ({ role: 'assistant', content, ...extra });

test('un résumé remplace tout ce qui le précède', () => {
  const { context, plain } = page();
  context.messages = [
    user('vieux'), assistant('ancien'),
    { role: 'compact', content: 'R1' },
    user('milieu'),
    { role: 'compact', content: 'R2' },
    user('neuf'), assistant(''),
    { role: 'compact', content: 'pas fini', job: 'j' },
  ];
  const history = plain('contextFor(messages)');
  assert.equal(history.length, 3);
  assert.match(history[0].content, /Résumé.*\nR2$/);
  assert.equal(history[1].role, 'assistant');
  assert.deepEqual(history[2], { role: 'user', content: 'neuf' });
});

test('les extraits de fichiers accompagnent le message', () => {
  const { context, plain } = page();
  context.messages = [user('lis ça', [{ name: 'a.txt', kind: 'fichier texte', size: 3, excerpt: 'abc', truncated: true, notes: ['2 lignes'] }])];
  const [message] = plain('contextFor(messages)');
  assert.equal(message.content, [
    'lis ça',
    '',
    '--- Fichier joint : a.txt (fichier texte, 3 o) ---',
    '2 lignes',
    'Seul un extrait du fichier est fourni ci-dessous.',
    'abc',
    '--- Fin du fichier ---',
  ].join('\n'));
  assert.equal(plain('estimateTokens([{ content: "x".repeat(9) }])'), 3);
});

test('/compact annonce les jetons économisés', () => {
  const conversation = { id: 'c', messages: [
    user('x'.repeat(4000)), assistant('y'.repeat(4000)),
    { role: 'compact', content: '<think>hmm</think>\nrésumé court', job: 'j', before: 2000 },
  ] };
  const { run, calls } = page([conversation]);
  run('conclude("c", "j", { failure: "", cancelled: false })');
  const summary = conversation.messages[2];
  assert.equal(summary.content, 'résumé court');
  assert.equal(summary.job, undefined);
  assert.ok(summary.saved > 1950 && summary.saved < 2000, String(summary.saved));
  assert.equal(calls.persisted, 1);
});

test('un résumé inutile, annulé ou en échec est abandonné', () => {
  for (const [content, outcome] of [
    ['z'.repeat(9000), { failure: '', cancelled: false }],
    ['court', { failure: '', cancelled: true }],
    ['court', { failure: 'panne', cancelled: false }],
  ]) {
    const conversation = { id: 'c', messages: [user('salut'), assistant('oui'), { role: 'compact', content, job: 'j', before: 40 }] };
    page([conversation]).run(`conclude("c", "j", ${JSON.stringify(outcome)})`);
    assert.equal(conversation.messages.length, 2, outcome.failure || String(outcome.cancelled));
  }
});

test('une réponse garde la trace d\'un arrêt ou d\'une erreur', () => {
  const finished = (content, outcome) => {
    const conversation = { id: 'c', renamed: true, messages: [user('q'), assistant(content, { job: 'j' })] };
    page([conversation]).run(`conclude("c", "j", ${JSON.stringify(outcome)})`);
    return conversation.messages[1];
  };
  assert.equal(finished('', { failure: '', cancelled: false }), undefined);
  assert.equal(finished('', { failure: '', cancelled: true }).interrupted, true);
  assert.equal(finished('début', { failure: 'panne', cancelled: false }).error, 'panne');
  const done = finished('fini', { failure: '', cancelled: false });
  assert.deepEqual(Object.keys(done).sort(), ['content', 'role']);
});

test('envoyer joint les fichiers, /compact demande un résumé, arrêter prévient le serveur', async () => {
  const conversation = { id: 'c', renamed: true, title: 't', messages: [user('q'), assistant('r')] };
  const { context, run, plain } = page([conversation]);
  const requests = [];
  Object.assign(context, {
    AbortController,
    $: () => ({ value: 'm', hidden: true, classList: { add() {} }, replaceChildren() {} }),
    companion: { done() {}, worry() {}, think() {}, talk() {} },
    api: (url, method, body) => {
      requests.push({ url, method, body: body && JSON.parse(JSON.stringify(body)) });
      return method === 'DELETE' ? Promise.resolve() : new Promise(() => {});
    },
  });
  run('renderCommands = () => {}; scrollDown = () => {};');
  run('send("lis", [{ name: "a", kind: "k", size: 1, excerpt: "contenu" }])');
  assert.equal(requests[0].body.compact, false);
  assert.match(requests[0].body.messages.at(-1).content, /^lis[\s\S]*contenu/);
  assert.equal(conversation.messages.at(-1).job, requests[0].body.id);
  run('stopRun("c")');
  assert.deepEqual([requests[1].method, requests[1].url], ['DELETE', `/api/chat/${requests[0].body.id}`]);

  run('dropRun("c")');
  conversation.messages.pop();
  run('compact()');
  const compacted = requests.at(-1).body;
  assert.equal(compacted.compact, true);
  assert.equal(plain('current.messages.at(-1)').role, 'compact');
});

test('un titre choisi à la main n\'est pas écrasé', async () => {
  const conversation = { id: 'c', title: 'à moi', renamed: true, messages: [] };
  const { context, run } = page([conversation]);
  context.api = async () => ({ json: async () => ({ title: 'automatique' }) });
  context.renderLocation = () => {};
  context.renderHistory = () => {};
  await run('summarize("c", "m", "x")');
  assert.equal(conversation.title, 'à moi');
  conversation.renamed = false;
  await run('summarize("c", "m", "x")');
  assert.equal(conversation.title, 'automatique');
});

test('la réflexion écrite dans la réponse en est séparée', () => {
  const { plain } = page();
  assert.deepEqual(plain('splitThought("<think>je cherche")'), { thought: 'je cherche', content: '' });
  assert.deepEqual(plain('splitThought("\\n<think>a</think>\\n\\nOui")'), { thought: 'a', content: 'Oui' });
  assert.deepEqual(plain('splitThought("<think></think>Oui")'), { thought: '', content: 'Oui' });
  assert.deepEqual(plain('splitThought("    code")'), { thought: '', content: '    code' });
  assert.deepEqual(plain('splitThought("la balise <think> existe")'), { thought: '', content: 'la balise <think> existe' });
});

test('seules les images du dernier message illustré sont jointes', async () => {
  const { context, run } = page();
  const asked = [];
  context.previews = { get: async (id) => { asked.push(id); return { views: Array(5).fill(id) }; } };
  context.messages = [
    user('avant', [{ id: 'vieux', name: 'a', kind: 'k', size: 1, views: 1 }]),
    user('après', [{ id: 'x', name: 'b', kind: 'k', size: 1, views: 5 }, { id: 'y', name: 'c', kind: 'k', size: 1, views: 5 }]),
    user('rien', [{ id: 'z', name: 'd', kind: 'k', size: 1, views: 0 }]),
  ];
  const sent = await run('withImages(contextFor(messages))');
  assert.deepEqual(asked, ['x', 'y']);
  assert.equal(sent[0].images, undefined);
  assert.deepEqual([...sent[1].images], [...Array(5).fill('x'), ...Array(3).fill('y')]);
  assert.equal(sent[2].images, undefined);
  assert.ok(sent.every((m) => !('attach' in m)));
});

test('une commande n\'est plus proposée une fois écrite en entier', () => {
  const { plain } = page();
  const names = (typed) => plain(`suggestions(${JSON.stringify(typed)}).map((c) => c.name)`);
  assert.deepEqual(names('/'), ['/compact']);
  assert.deepEqual(names('/comp'), ['/compact']);
  for (const typed of ['/compact', '/compact ', '/autre', '/pact', 'bonjour', '']) {
    assert.deepEqual(names(typed), [], typed);
  }
});

test('sans image, ou aperçu disparu, rien n\'est joint ; occupé, rien n\'est proposé', async () => {
  const { context, run, plain } = page([{ id: 'c', messages: [] }]);
  context.previews = { get: async () => null };
  context.messages = [user('a'), user('b', [{ id: 'perdu', name: 'a', kind: 'k', size: 1, views: 1 }])];
  const sent = await run('withImages(contextFor(messages))');
  assert.ok(sent.every((m) => !('images' in m) && !('attach' in m)));
  assert.equal((await run('withImages([{ role: "user", content: "a" }])')).length, 1);
  run('runs.set("c", {})');
  assert.deepEqual(plain('suggestions("/comp")'), []);
});

test('une réponse suivie reçoit les images et garde sa réflexion à part', async () => {
  const conversation = { id: 'c', renamed: true, messages: [user('q'), assistant('', { job: 'j', trace: {} })] };
  const { context, run } = page([conversation]);
  context.current = null;
  let sent;
  Object.assign(context, {
    AbortController,
    companion: { done() {}, worry() {}, think() {}, talk() {} },
    previews: { get: async () => ({ views: ['IMG'] }) },
    api: async (url, method, body) => { if (url === '/api/chat') sent = JSON.parse(JSON.stringify(body)); return {}; },
    readLines: async (response, onLine) => {
      onLine({ info: 'avis' });
      onLine({ message: { thinking: 'je ' } });
      onLine({ message: { content: '<think>pense</think>Oui' } });
    },
  });
  await run('follow("c", "j", { messages: [{ role: "user", content: "q", attach: ["f"] }] })');
  assert.deepEqual(sent.messages, [{ role: 'user', content: 'q', images: ['IMG'] }]);
  const reply = conversation.messages[1];
  assert.equal(reply.content, 'Oui');
  assert.equal(reply.thinking, 'je pense');
  assert.equal(reply.trace.info, 'avis');
  assert.equal(reply.trace.started, undefined);
});

test('/compact n\'envoie pas les images', () => {
  const files = [{ id: 'f', name: 'a', kind: 'k', size: 1, views: 1 }];
  const conversation = { id: 'c', messages: [user('q', files), assistant('r')] };
  const { run } = page([conversation]);
  run('request = (c, role, model, history) => { globalThis.asked = history; }');
  run('$ = () => ({ value: "m" }); compact()');
  assert.ok(run('asked.length === 2 && asked.every((m) => !("attach" in m))'));
});

test('une réflexion sans réponse reste visible', () => {
  const conversation = { id: 'c', renamed: true, messages: [user('q'), assistant('', { job: 'j', thinking: 'hmm' })] };
  page([conversation]).run('conclude("c", "j", { failure: "", cancelled: false })');
  assert.match(conversation.messages[1].error, /sans produire de réponse/);
});
