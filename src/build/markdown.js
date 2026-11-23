'use strict';

const { escapeHtml, sanitizeUrl, withBasePath } = require('./html');

const LINK_SCHEMES = ['http', 'https', 'mailto'];
const IMAGE_SCHEMES = ['http', 'https'];
const ESCAPABLE = /[!-/:-@[-`{-~]/;
const FENCE = /^( {0,3})(`{3,}|~{3,})[ \t]*(.*)$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const QUOTE = /^ {0,3}> ?/;
const LIST_MARKER = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(.*)$/;

/* ---------- 블록 ---------- */

const isBlank = (line) => line.trim() === '';

function indentOf(line) {
  let columns = 0;
  for (const char of line) {
    if (char === ' ') columns += 1;
    else if (char === '\t') columns += 4;
    else break;
  }
  return columns;
}

function stripIndent(line, count) {
  let columns = 0;
  let index = 0;
  while (index < line.length && columns < count) {
    if (line[index] === ' ') columns += 1;
    else if (line[index] === '\t') columns += 4;
    else break;
    index += 1;
  }
  return line.slice(index);
}

function parseFence(line) {
  const match = FENCE.exec(line);
  if (!match) return null;
  if (match[2][0] === '`' && match[3].includes('`')) return null;
  return { indent: match[1].length, marker: match[2], info: match[3].trim() };
}

function isClosingFence(line, fence) {
  if (indentOf(line) > 3) return false;
  const text = line.trim();
  return text.length >= fence.marker.length && text === fence.marker[0].repeat(text.length);
}

function parseMarker(line) {
  const match = LIST_MARKER.exec(line);
  if (!match || HR.test(line)) return null;

  const indent = indentOf(match[1]);
  const spaces = indentOf(match[3]);
  const ordered = /\d/.test(match[2]);
  let content = match[4];
  let gap = spaces;
  if (!content.trim()) {
    gap = 1;
    content = '';
  } else if (spaces > 4) {
    gap = 1;
    content = ' '.repeat(spaces - 1) + content;
  }
  return {
    indent,
    ordered,
    start: ordered ? parseInt(match[2], 10) : 1,
    content,
    contentIndent: indent + match[2].length + gap,
  };
}

function splitRow(line) {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  const cells = [];
  let current = '';
  let closed = false;
  for (let i = 0; i < text.length; i += 1) {
    closed = false;
    if (text[i] === '\\' && text[i + 1] === '|') {
      current += '|';
      i += 1;
    } else if (text[i] === '|') {
      cells.push(current.trim());
      current = '';
      closed = true;
    } else {
      current += text[i];
    }
  }
  if (!closed) cells.push(current.trim());
  return cells;
}

function isTableStart(lines, index) {
  const header = lines[index];
  const delimiter = lines[index + 1];
  if (delimiter === undefined || !header.includes('|') || !delimiter.includes('|')) return false;
  const cells = splitRow(delimiter);
  return cells.every((cell) => /^:?-+:?$/.test(cell)) && cells.length === splitRow(header).length;
}

function startsBlock(lines, index) {
  const line = lines[index];
  if (parseFence(line) || HR.test(line) || HEADING.test(line) || QUOTE.test(line)) return true;
  if (isTableStart(lines, index)) return true;
  const marker = parseMarker(line);
  // "2024. 올해는" 같은 문장이 목록이 되지 않도록 번호 목록은 1부터만 문단을 끊는다.
  return Boolean(marker && marker.indent <= 3 && marker.content && (!marker.ordered || marker.start === 1));
}

function nextNonBlank(lines, index) {
  let next = index;
  while (next < lines.length && isBlank(lines[next])) next += 1;
  return next;
}

function parseCodeBlock(lines, start, fence) {
  const body = [];
  let index = start + 1;
  while (index < lines.length && !isClosingFence(lines[index], fence)) {
    body.push(stripIndent(lines[index], fence.indent));
    index += 1;
  }
  const language = fence.info.split(/\s+/)[0];
  const className = /^[\w+#.-]+$/.test(language) ? ` class="language-${escapeHtml(language)}"` : '';
  const code = body.length ? `${escapeHtml(body.join('\n'))}\n` : '';
  return { html: `<pre tabindex="0"><code${className}>${code}</code></pre>`, next: index + 1 };
}

function parseTable(lines, start, options) {
  const header = splitRow(lines[start]);
  const aligns = splitRow(lines[start + 1]).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return ' class="align-center"';
    if (right) return ' class="align-right"';
    return left ? ' class="align-left"' : '';
  });

  const rows = [];
  let index = start + 2;
  while (index < lines.length && !isBlank(lines[index]) && lines[index].includes('|') && !startsBlock(lines, index)) {
    rows.push(splitRow(lines[index]));
    index += 1;
  }

  const head = header.map((cell, i) => `<th scope="col"${aligns[i]}>${renderInline(cell, options)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${header.map((_, i) => `<td${aligns[i]}>${renderInline(row[i] || '', options)}</td>`).join('')}</tr>`)
    .join('\n');
  const tbody = rows.length ? `\n<tbody>\n${body}\n</tbody>` : '';
  return {
    html: `<div class="table-wrap" tabindex="0" role="region" aria-label="표"><table>\n<thead><tr>${head}</tr></thead>${tbody}\n</table></div>`,
    next: index,
  };
}

function parseList(lines, start, options) {
  const first = parseMarker(lines[start]);
  const items = [];
  let loose = false;
  let index = start;

  while (index < lines.length) {
    const marker = parseMarker(lines[index]);
    if (!marker || marker.ordered !== first.ordered || marker.indent > first.indent) break;

    const itemLines = [marker.content];
    let openFence = parseFence(marker.content);
    index += 1;

    while (index < lines.length) {
      const line = lines[index];
      if (isBlank(line)) {
        const next = nextNonBlank(lines, index);
        if (next >= lines.length) break;
        const nextMarker = parseMarker(lines[next]);
        const belongs = indentOf(lines[next]) >= marker.contentIndent || (nextMarker && nextMarker.indent > first.indent);
        if (!belongs) break;
        if (!openFence && !nextMarker) loose = true;
        for (let i = index; i < next; i += 1) itemLines.push('');
        index = next;
        continue;
      }

      const nested = parseMarker(line);
      let content;
      if (indentOf(line) >= marker.contentIndent) {
        content = stripIndent(line, marker.contentIndent);
      } else if (nested) {
        if (nested.indent <= first.indent) break;
        content = stripIndent(line, Math.min(nested.indent, marker.contentIndent));
      } else if (startsBlock(lines, index) || itemLines[itemLines.length - 1] === '') {
        break;
      } else {
        content = line.trim();
      }

      if (openFence) {
        if (isClosingFence(content, openFence)) openFence = null;
      } else {
        openFence = parseFence(content);
      }
      itemLines.push(content);
      index += 1;
    }
    items.push(itemLines);

    if (index < lines.length && isBlank(lines[index])) {
      const next = nextNonBlank(lines, index);
      const sibling = next < lines.length ? parseMarker(lines[next]) : null;
      if (!sibling || sibling.ordered !== first.ordered || sibling.indent > first.indent) break;
      loose = true;
      index = next;
    }
  }

  const tag = first.ordered ? 'ol' : 'ul';
  const startAttr = first.ordered && first.start !== 1 ? ` start="${first.start}"` : '';
  const body = items.map((item) => `<li>${parseBlocks(item, options, !loose).join('\n')}</li>`).join('\n');
  return { html: `<${tag}${startAttr}>\n${body}\n</${tag}>`, next: index };
}

function parseBlocks(lines, options, tight = false) {
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (isBlank(line)) {
      index += 1;
      continue;
    }

    const fence = parseFence(line);
    if (fence) {
      const block = parseCodeBlock(lines, index, fence);
      blocks.push(block.html);
      index = block.next;
      continue;
    }

    if (HR.test(line)) {
      blocks.push('<hr>');
      index += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2] || '', options)}</h${level}>`);
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner = [];
      while (index < lines.length && QUOTE.test(lines[index])) {
        inner.push(lines[index].replace(QUOTE, ''));
        index += 1;
      }
      blocks.push(`<blockquote>\n${parseBlocks(inner, options).join('\n')}\n</blockquote>`);
      continue;
    }

    const marker = parseMarker(line);
    if (marker && marker.indent <= 3) {
      const block = parseList(lines, index, options);
      blocks.push(block.html);
      index = block.next;
      continue;
    }

    if (isTableStart(lines, index)) {
      const block = parseTable(lines, index, options);
      blocks.push(block.html);
      index = block.next;
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && !isBlank(lines[index]) && !startsBlock(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    const inline = renderInline(paragraph.join('\n'), options);
    blocks.push(tight ? inline : `<p>${inline}</p>`);
  }
  return blocks;
}

/* ---------- 인라인 ---------- */

function backtickRun(text, position) {
  let end = position;
  while (text[end] === '`') end += 1;
  return end - position;
}

function findCodeClose(text, from, length) {
  let index = from;
  while (index < text.length) {
    if (text[index] !== '`') {
      index += 1;
      continue;
    }
    const run = backtickRun(text, index);
    if (run === length) return index;
    index += run;
  }
  return -1;
}

function findClosingBracket(text, open) {
  let depth = 0;
  let index = open;
  while (index < text.length) {
    const char = text[index];
    if (char === '\\') {
      index += 2;
    } else if (char === '`') {
      const run = backtickRun(text, index);
      const close = findCodeClose(text, index + run, run);
      index = close < 0 ? index + run : close + run;
    } else {
      if (char === '[') depth += 1;
      if (char === ']') {
        depth -= 1;
        if (depth === 0) return index;
      }
      index += 1;
    }
  }
  return -1;
}

function skipSpace(text, position) {
  let index = position;
  while (index < text.length && /\s/.test(text[index])) index += 1;
  return index;
}

function parseTarget(text, open) {
  let index = skipSpace(text, open + 1);
  let url = '';

  if (text[index] === '<') {
    const close = text.indexOf('>', index);
    if (close < 0 || text.slice(index, close).includes('\n')) return null;
    url = text.slice(index + 1, close).replace(/ /g, '%20');
    index = close + 1;
  } else {
    let depth = 0;
    while (index < text.length) {
      const char = text[index];
      if (char === '\\' && index + 1 < text.length) {
        url += ESCAPABLE.test(text[index + 1]) ? text[index + 1] : char + text[index + 1];
        index += 2;
        continue;
      }
      if (/\s/.test(char)) break;
      if (char === '(') depth += 1;
      if (char === ')') {
        if (depth === 0) break;
        depth -= 1;
      }
      url += char;
      index += 1;
    }
    if (depth !== 0) return null;
  }

  index = skipSpace(text, index);
  let title = '';
  if (text[index] === '"' || text[index] === "'") {
    const quote = text[index];
    let close = index + 1;
    while (close < text.length && text[close] !== quote) close += text[close] === '\\' ? 2 : 1;
    if (close >= text.length) return null;
    title = text.slice(index + 1, close).replace(/\\(["'\\])/g, '$1');
    index = skipSpace(text, close + 1);
  }
  if (text[index] !== ')') return null;
  return { url, title, end: index + 1 };
}

function parseLink(text, open) {
  const close = findClosingBracket(text, open);
  if (close < 0 || text[close + 1] !== '(') return null;
  const target = parseTarget(text, close + 1);
  return target && { ...target, label: text.slice(open + 1, close) };
}

function renderCode(raw) {
  let code = raw.replace(/\n/g, ' ');
  if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
  return `<code>${escapeHtml(code)}</code>`;
}

function renderImage(link, options) {
  const alt = renderInline(link.label, options, true).replace(/<[^>]*>/g, '');
  const src = sanitizeUrl(link.url, IMAGE_SCHEMES);
  if (!src) return alt;
  const title = link.title ? ` title="${escapeHtml(link.title)}"` : '';
  return `<img src="${escapeHtml(withBasePath(src, options.basePath))}" alt="${alt}"${title} loading="lazy">`;
}

function renderLink(link, options) {
  const label = renderInline(link.label, options, true);
  const href = sanitizeUrl(link.url, LINK_SCHEMES);
  if (!href) return label;
  const title = link.title ? ` title="${escapeHtml(link.title)}"` : '';
  return `<a href="${escapeHtml(withBasePath(href, options.basePath))}"${title}>${label}</a>`;
}

const isSpace = (char) => char === undefined || /\s/.test(char);
const isWord = (char) => char !== undefined && /[\p{L}\p{N}]/u.test(char);

function delimiterNode(text, position, length) {
  const char = text[position];
  const before = text[position - 1];
  const after = text[position + length];
  // **"강조"**는처럼 문장 부호 뒤에 조사가 붙어도 닫히도록 *는 공백 기준으로만 판단한다.
  let canOpen = !isSpace(after);
  let canClose = !isSpace(before);
  if (char === '_') {
    canOpen = canOpen && !isWord(before);
    canClose = canClose && !isWord(after);
  }
  return { delimiter: true, char, count: length, canOpen, canClose, openTags: '', closeTags: '' };
}

function resolveEmphasis(nodes) {
  nodes.forEach((closer, closerIndex) => {
    if (!closer.delimiter || !closer.canClose) return;

    while (closer.count > 0) {
      let openerIndex = closerIndex - 1;
      while (openerIndex >= 0) {
        const node = nodes[openerIndex];
        if (node.delimiter && node.char === closer.char && node.canOpen && node.count > 0) break;
        openerIndex -= 1;
      }
      if (openerIndex < 0) break;

      const opener = nodes[openerIndex];
      const used = opener.count >= 2 && closer.count >= 2 ? 2 : 1;
      const tag = used === 2 ? 'strong' : 'em';
      opener.openTags = `<${tag}>${opener.openTags}`;
      closer.closeTags += `</${tag}>`;
      opener.count -= used;
      closer.count -= used;

      // 짝이 맺어진 구간 안의 구분자는 태그가 교차하지 않도록 글자로 남긴다.
      for (let i = openerIndex + 1; i < closerIndex; i += 1) {
        if (nodes[i].delimiter) {
          nodes[i].canOpen = false;
          nodes[i].canClose = false;
        }
      }
    }
  });
}

function renderInline(text, options, insideLink = false) {
  const nodes = [];
  let buffer = '';
  let index = 0;

  const flush = () => {
    if (buffer) nodes.push({ html: escapeHtml(buffer) });
    buffer = '';
  };
  const pushHtml = (html) => {
    flush();
    nodes.push({ html });
  };

  while (index < text.length) {
    const char = text[index];

    if (char === '\\' && index + 1 < text.length && ESCAPABLE.test(text[index + 1])) {
      buffer += text[index + 1];
      index += 2;
    } else if (char === '`') {
      const run = backtickRun(text, index);
      const close = findCodeClose(text, index + run, run);
      if (close < 0) {
        buffer += '`'.repeat(run);
        index += run;
      } else {
        pushHtml(renderCode(text.slice(index + run, close)));
        index = close + run;
      }
    } else if (char === '!' && text[index + 1] === '[') {
      const link = parseLink(text, index + 1);
      if (link) {
        pushHtml(renderImage(link, options));
        index = link.end;
      } else {
        buffer += char;
        index += 1;
      }
    } else if (char === '[' && !insideLink) {
      const link = parseLink(text, index);
      if (link) {
        pushHtml(renderLink(link, options));
        index = link.end;
      } else {
        buffer += char;
        index += 1;
      }
    } else if (char === '*' || char === '_') {
      let end = index;
      while (text[end] === char) end += 1;
      flush();
      nodes.push(delimiterNode(text, index, end - index));
      index = end;
    } else {
      buffer += char;
      index += 1;
    }
  }
  flush();
  resolveEmphasis(nodes);

  return nodes
    .map((node) => (node.delimiter ? node.closeTags + node.char.repeat(node.count) + node.openTags : node.html))
    .join('');
}

function renderMarkdown(source, { basePath = '' } = {}) {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  return parseBlocks(lines, { basePath }).join('\n');
}

module.exports = { renderMarkdown };
