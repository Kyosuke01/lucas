'use strict';

// Markdown des réponses. Le texte du modèle est d'abord découpé en un arbre, puis
// affiché nœud par nœud : aucun HTML venant du modèle n'est jamais interprété.
const markdown = (() => {
  const MAX_DEPTH = 12;

  // ── Dans la ligne ──────────────────────────────────────────────────────────
  const isWord = (c) => /[\p{L}\p{N}]/u.test(c || '');
  const isSpace = (c) => !c || /\s/.test(c);
  const DELIMITERS = [['**', 'strong'], ['__', 'strong'], ['~~', 'del'], ['*', 'em'], ['_', 'em']];
  const safeLink = (href) => /^(https?:\/\/|mailto:)[^\s]+$/i.test(href);

  function closing(text, from, mark) {
    for (let at = text.indexOf(mark, from); at >= 0; at = text.indexOf(mark, at + 1)) {
      // « * » ne se referme pas sur la moitié d'un « ** ».
      if (mark.length === 1 && text[at + 1] === mark && text[at + 2] !== mark) { at += 1; continue; }
      if (isSpace(text[at - 1]) || text[at - 1] === '\\') continue;
      // « _ » à l'intérieur d'un mot (nom_de_variable) ne ferme rien.
      if (mark[0] === '_' && isWord(text[at + mark.length])) continue;
      return at;
    }
    return -1;
  }

  // Parenthèses équilibrées : certaines adresses en contiennent.
  function matching(text, from, open, close) {
    let depth = 0;
    for (let at = from; at < text.length && at < from + 2000; at += 1) {
      if (text[at] === open) depth += 1;
      else if (text[at] === close) {
        depth -= 1;
        if (!depth) return at;
      }
    }
    return -1;
  }

  function inline(text, depth = 0) {
    const nodes = [];
    // Signes restés sans fin : inutile de les rechercher à nouveau.
    const unclosed = new Set();
    let plain = '';
    const flush = () => {
      if (plain) nodes.push(plain);
      plain = '';
    };
    const push = (node) => { flush(); nodes.push(node); };

    for (let i = 0; i < text.length;) {
      const c = text[i];
      if (c === '\\' && /[!-/:-@[-`{-~]/.test(text[i + 1] || '')) {
        plain += text[i + 1];
        i += 2;
        continue;
      }
      if (c === '`') {
        let end = i;
        while (text[end] === '`') end += 1;
        const fence = text.slice(i, end);
        const close = unclosed.has(fence) ? -1 : text.indexOf(fence, end);
        if (close >= 0) {
          push({ type: 'code', text: text.slice(end, close).replace(/^ (.*) $/s, '$1') });
          i = close + fence.length;
          continue;
        }
        unclosed.add(fence);
        plain += fence;
        i = end;
        continue;
      }
      if (c === '[' && depth < MAX_DEPTH) {
        const label = matching(text, i, '[', ']');
        if (label > 0 && text[label + 1] === '(') {
          const end = matching(text, label + 1, '(', ')');
          const href = end > 0 ? text.slice(label + 2, end).trim().split(/\s/)[0] : '';
          if (safeLink(href)) {
            push({ type: 'link', href, children: inline(text.slice(i + 1, label), depth + 1) });
            i = end + 1;
            continue;
          }
        }
      }
      if (c === 'h' && !isWord(text[i - 1])) {
        const url = /^https?:\/\/[^\s<>"'`]+/.exec(text.slice(i, i + 2000));
        if (url) {
          const href = url[0].replace(/[.,;:!?)\]*_]+$/, '');
          push({ type: 'link', href, children: [href] });
          i += href.length;
          continue;
        }
      }
      const found = DELIMITERS.find(([mark]) => text.startsWith(mark, i));
      if (found && depth < MAX_DEPTH) {
        const [mark, type] = found;
        const opens = !isSpace(text[i + mark.length]) && !(mark[0] === '_' && isWord(text[i - 1]));
        const close = opens && !unclosed.has(mark) ? closing(text, i + mark.length + 1, mark) : -1;
        if (close >= 0) {
          push({ type, children: inline(text.slice(i + mark.length, close), depth + 1) });
          i = close + mark.length;
          continue;
        }
        if (opens) unclosed.add(mark);
        plain += mark;
        i += mark.length;
        continue;
      }
      plain += c;
      i += 1;
    }
    flush();
    return nodes;
  }

  // ── Blocs ──────────────────────────────────────────────────────────────────
  const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/;
  const HEADING = /^ {0,3}(#{1,6})\s+(.*)$/;
  const RULE = /^ {0,3}([-*_])(\s*\1){2,}\s*$/;
  const QUOTE = /^ {0,3}> ?/;
  const ITEM = /^( *)([-*+]|\d{1,9}[.)])( +|$)(.*)$/;
  const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

  function cells(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '')
      .split(/(?<!\\)\|/).map((cell) => cell.trim().replaceAll('\\|', '|'));
  }
  const tableStarts = (lines, i) => lines[i].includes('|') && lines[i + 1]?.includes('-')
    && lines[i + 1].includes('|') && TABLE_RULE.test(lines[i + 1]);
  const interrupts = (lines, i) => [FENCE, HEADING, RULE, QUOTE, ITEM].some((r) => r.test(lines[i]))
    || tableStarts(lines, i);

  function blocks(lines, depth = 0) {
    const nodes = [];
    for (let i = 0; i < lines.length;) {
      const line = lines[i];
      let match;
      if (!line.trim()) {
        i += 1;
      } else if ((match = FENCE.exec(line))) {
        const [, fence, lang] = match;
        const body = [];
        // Un bloc pas encore refermé (réponse en cours) va jusqu'à la fin.
        for (i += 1; i < lines.length; i += 1) {
          const end = lines[i].trim();
          if (end.startsWith(fence) && end === end[0].repeat(end.length)) { i += 1; break; }
          body.push(lines[i]);
        }
        nodes.push({ type: 'pre', lang, text: body.join('\n') });
      } else if ((match = HEADING.exec(line))) {
        nodes.push({ type: 'heading', level: match[1].length, children: inline(match[2].trim()) });
        i += 1;
      } else if (RULE.test(line)) {
        nodes.push({ type: 'hr' });
        i += 1;
      } else if (QUOTE.test(line) && depth < MAX_DEPTH) {
        const body = [];
        for (; i < lines.length && QUOTE.test(lines[i]); i += 1) body.push(lines[i].replace(QUOTE, ''));
        nodes.push({ type: 'quote', children: blocks(body, depth + 1) });
      } else if ((match = ITEM.exec(line)) && depth < MAX_DEPTH) {
        i = list(lines, i, match, nodes, depth);
      } else if (tableStarts(lines, i)) {
        const head = cells(line).map((cell) => inline(cell));
        const rows = [];
        for (i += 2; i < lines.length && lines[i].includes('|') && lines[i].trim(); i += 1) {
          const row = cells(lines[i]);
          rows.push(head.map((_, column) => inline(row[column] || '')));
        }
        nodes.push({ type: 'table', head, rows });
      } else {
        const body = [line.trim()];
        for (i += 1; i < lines.length && lines[i].trim() && !interrupts(lines, i); i += 1) body.push(lines[i].trim());
        nodes.push({ type: 'p', children: inline(body.join('\n')) });
      }
    }
    return nodes;
  }

  function list(lines, from, first, nodes, depth) {
    const indent = first[1].length;
    const ordered = /\d/.test(first[2]);
    const items = [];
    let body = null;
    let width = 0;
    let i = from;
    for (; i < lines.length; i += 1) {
      const line = lines[i];
      const match = ITEM.exec(line);
      const spaces = line.length - line.trimStart().length;
      if (match && match[1].length <= indent + 1 && !RULE.test(line)) {
        if (match[1].length < indent || /\d/.test(match[2]) !== ordered) break;
        body = [match[4]];
        width = match[1].length + match[2].length + 1;
        items.push(body);
      } else if (!line.trim()) {
        // Une ligne vide ne termine la liste que si la suite n'en fait plus partie.
        const next = lines.slice(i + 1).find((l) => l.trim());
        const continues = next && (next.length - next.trimStart().length > indent || ITEM.test(next));
        if (!continues) break;
        body.push('');
      } else if (spaces > indent) {
        body.push(line.slice(Math.min(spaces, width)));
      } else if (!interrupts(lines, i) && body.at(-1) !== '') {
        body.push(line);
      } else {
        break;
      }
    }
    nodes.push({
      type: 'list',
      ordered,
      start: ordered ? parseInt(first[2], 10) : 1,
      items: items.map((item) => blocks(item, depth + 1)),
    });
    return i;
  }

  const parse = (text) => blocks(text.replace(/\r\n?/g, '\n').replaceAll('\t', '    ').split('\n'));

  // ── Affichage ──────────────────────────────────────────────────────────────
  const make = (tag, children = []) => {
    const node = document.createElement(tag);
    node.append(...children);
    return node;
  };

  function renderInline(nodes) {
    return nodes.map((node) => {
      if (typeof node === 'string') return document.createTextNode(node);
      if (node.type === 'code') return make('code', [node.text]);
      const children = renderInline(node.children);
      if (node.type !== 'link') return make(node.type, children);
      const link = make('a', children);
      link.href = node.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      return link;
    });
  }

  function renderBlock(node, tight) {
    if (node.type === 'p') {
      const children = renderInline(node.children);
      return tight ? make('span', children) : make('p', children);
    }
    if (node.type === 'heading') return make(`h${Math.min(6, node.level + 2)}`, renderInline(node.children));
    if (node.type === 'pre') {
      const pre = make('pre', [make('code', [node.text])]);
      if (node.lang) pre.dataset.lang = node.lang;
      return pre;
    }
    if (node.type === 'hr') return make('hr');
    if (node.type === 'quote') return make('blockquote', node.children.map((child) => renderBlock(child)));
    if (node.type === 'list') {
      const list = make(node.ordered ? 'ol' : 'ul', node.items.map((item) =>
        make('li', item.map((child) => renderBlock(child, true)))));
      if (node.ordered) list.start = node.start;
      return list;
    }
    const row = (tag, values) => make('tr', values.map((value) => make(tag, renderInline(value))));
    const table = make('table', [
      make('thead', [row('th', node.head)]),
      make('tbody', node.rows.map((values) => row('td', values))),
    ]);
    const scroll = make('div', [table]);
    scroll.className = 'table';
    return scroll;
  }

  return { parse, render: (text) => parse(text).map((node) => renderBlock(node)) };
})();

// Pour les tests, hors du navigateur.
if (typeof module !== 'undefined') module.exports = markdown;
