'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse, render } = require('../markdown.js');

const p = (...children) => ({ type: 'p', children });

test('mise en forme dans la ligne', () => {
  assert.deepEqual(parse('un **gras** et *penché* ~~barré~~ `code *brut*`'), [p(
    'un ', { type: 'strong', children: ['gras'] }, ' et ', { type: 'em', children: ['penché'] }, ' ',
    { type: 'del', children: ['barré'] }, ' ', { type: 'code', text: 'code *brut*' },
  )]);
  assert.deepEqual(parse('*a **b** c*'), [p({ type: 'em', children: ['a ', { type: 'strong', children: ['b'] }, ' c'] })]);
});

test('les signes ordinaires restent du texte', () => {
  for (const text of ['nom_de_variable_longue', '2 * 3 * 4', 'a ** b', 'fin ouverte **ici', 'un ` seul', '<b>html</b>']) {
    assert.deepEqual(parse(text), [p(text)], text);
  }
  assert.deepEqual(parse('\\*pas penché\\*'), [p('*pas penché*')]);
});

test('seuls les liens web et courriel deviennent cliquables', () => {
  const link = (href, label) => ({ type: 'link', href, children: [label] });
  assert.deepEqual(parse('[doc](https://a.test/x_(y))'), [p(link('https://a.test/x_(y)', 'doc'))]);
  assert.deepEqual(parse('voir https://a.test/b.'), [p('voir ', link('https://a.test/b', 'https://a.test/b'), '.')]);
  // Une adresse web plus loin dans la cible ne la rend pas sûre.
  const [tricky] = parse('[x](javascript:go//http://a.test)');
  const hrefs = tricky.children.filter((n) => n.type === 'link').map((n) => n.href);
  assert.ok(hrefs.every((href) => href.startsWith('http://')), hrefs.join());
  for (const href of ['javascript:alert(1)', 'data:text/html,x', '/api/settings', 'JaVaScRiPt:x']) {
    const nodes = parse(`[x](${href})`);
    assert.ok(!JSON.stringify(nodes).includes('"link"'), href);
  }
});

test('titres, filets et citations', () => {
  assert.deepEqual(parse('## Titre\n---\n> cité\n> encore'), [
    { type: 'heading', level: 2, children: ['Titre'] },
    { type: 'hr' },
    { type: 'quote', children: [p('cité\nencore')] },
  ]);
});

test('blocs de code, même pas encore refermés', () => {
  assert.deepEqual(parse('```js\nlet a = 1;\n\n  **b**\n```\naprès'), [
    { type: 'pre', lang: 'js', text: 'let a = 1;\n\n  **b**' },
    p('après'),
  ]);
  assert.deepEqual(parse('```\nen cours'), [{ type: 'pre', lang: '', text: 'en cours' }]);
});

test('listes imbriquées et numérotées', () => {
  assert.deepEqual(parse('- un\n  - sous\n- deux\n\ntexte'), [
    { type: 'list', ordered: false, start: 1, items: [
      [p('un'), { type: 'list', ordered: false, start: 1, items: [[p('sous')]] }],
      [p('deux')],
    ] },
    p('texte'),
  ]);
  const [list] = parse('3. a\n\n4. b');
  assert.equal(list.ordered, true);
  assert.equal(list.start, 3);
  assert.equal(list.items.length, 2);
});

test('tableaux', () => {
  assert.deepEqual(parse('| a | b |\n|---|:-:|\n| 1 | x\\|y |\n| 2 |'), [{
    type: 'table',
    head: [['a'], ['b']],
    rows: [[['1'], ['x|y']], [['2'], []]],
  }]);
});

test('un texte piégé reste rapide et ne fait pas déborder la pile', () => {
  const started = Date.now();
  for (const text of ['**a '.repeat(20000), '['.repeat(20000), '> '.repeat(5000), '`'.repeat(5000), '\n'.repeat(50000), '- '.repeat(5000)]) {
    parse(text);
  }
  assert.ok(Date.now() - started < 3000, `${Date.now() - started} ms`);
});

test('l\'affichage n\'interprète jamais de HTML et protège les liens', () => {
  // Un document minimal : toute écriture d'innerHTML ferait échouer le test.
  const node = (tag) => {
    const made = { tag, children: [], dataset: {}, append: (...c) => made.children.push(...c) };
    Object.defineProperty(made, 'innerHTML', { set() { throw new Error('innerHTML'); } });
    return made;
  };
  globalThis.document = { createElement: node, createTextNode: (text) => ({ text }) };
  try {
    const [paragraph] = render('<img src=x onerror=a> [ici](https://a.test)');
    assert.equal(paragraph.tag, 'p');
    assert.equal(paragraph.children[0].text, '<img src=x onerror=a> ');
    const link = paragraph.children[1];
    assert.deepEqual([link.href, link.target, link.rel], ['https://a.test', '_blank', 'noopener noreferrer']);
    const [pre] = render('```\n<script>\n```');
    assert.deepEqual(pre.children[0].children, ['<script>']);
  } finally {
    delete globalThis.document;
  }
});
