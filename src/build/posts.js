'use strict';

const fs = require('node:fs');
const path = require('node:path');

function unquote(value) {
  const match = /^(["'])(.*)\1$/.exec(value);
  return match ? match[2] : value;
}

function parseTags(value) {
  if (!value) return [];
  const inner = /^\[(.*)\]$/.exec(value);
  if (!inner) return [unquote(value)];

  const tags = [];
  let current = '';
  let quote = '';
  for (const char of inner[1]) {
    if (quote) {
      if (char === quote) quote = '';
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ',') {
      tags.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  tags.push(current.trim());
  return tags.filter(Boolean);
}

function parseFrontMatter(source, fileName) {
  const text = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const match = /^---[ \t]*\n([\s\S]*?)\n?---[ \t]*(?:\n|$)/.exec(text);
  if (!match) throw new Error(`${fileName}: front matter가 없습니다.`);

  const data = {};
  match[1].split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(trimmed);
    if (!pair) {
      throw new Error(`${fileName}: front matter ${index + 1}번째 줄을 해석할 수 없습니다.`);
    }
    data[pair[1]] = pair[2].trim();
  });
  return { data, body: text.slice(match[0].length) };
}

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parsePost(source, fileName) {
  const { data, body } = parseFrontMatter(source, fileName);
  const title = unquote(data.title || '').trim();
  const date = unquote(data.date || '').trim();
  const draft = unquote(data.draft || 'false').trim();

  if (!title) throw new Error(`${fileName}: 필수 항목 title이 없습니다.`);
  if (!date) throw new Error(`${fileName}: 필수 항목 date가 없습니다.`);
  if (!isValidDate(date)) throw new Error(`${fileName}: date는 YYYY-MM-DD 형식의 실제 날짜여야 합니다.`);
  // 오타가 난 초안이 공개되지 않도록 true/false 외의 값은 거부한다.
  if (draft !== 'true' && draft !== 'false') throw new Error(`${fileName}: draft는 true 또는 false여야 합니다.`);

  return {
    // macOS 파일명의 분해된 한글이 URL에 들어가지 않도록 NFC로 맞춘다.
    slug: path.basename(fileName, '.md').normalize('NFC'),
    title,
    date,
    description: unquote(data.description || ''),
    tags: parseTags(data.tags || ''),
    draft: draft === 'true',
    body,
  };
}

function loadPosts(postsDir) {
  if (!fs.existsSync(postsDir)) return [];
  return fs
    .readdirSync(postsDir)
    .filter((name) => name.endsWith('.md') && !name.startsWith('.'))
    .map((name) => parsePost(fs.readFileSync(path.join(postsDir, name), 'utf8'), name))
    .filter((post) => !post.draft)
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

module.exports = { parsePost, loadPosts };
