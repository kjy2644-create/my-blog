'use strict';

const { escapeHtml } = require('./html');

const TAG = /\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*(?:(#if|#each)\s+([\w.]+)|(\/if|\/each|else)|([\w.]+))\s*\}\}/g;

function parseTemplate(source, name) {
  const root = [];
  const stack = [{ list: root }];
  let last = 0;

  for (const match of source.matchAll(TAG)) {
    const frame = stack[stack.length - 1];
    if (match.index > last) frame.list.push({ type: 'text', value: source.slice(last, match.index) });
    last = match.index + match[0].length;

    if (match[1]) {
      frame.list.push({ type: 'var', path: match[1], raw: true });
    } else if (match[5]) {
      frame.list.push({ type: 'var', path: match[5], raw: false });
    } else if (match[2]) {
      const node = { type: match[2].slice(1), path: match[3], body: [], otherwise: [] };
      frame.list.push(node);
      stack.push({ node, list: node.body });
    } else if (match[4] === 'else') {
      if (!frame.node || frame.node.type !== 'if') throw new Error(`${name}: 짝이 없는 {{else}}입니다.`);
      frame.list = frame.node.otherwise;
    } else {
      const type = match[4].slice(1);
      if (!frame.node || frame.node.type !== type) throw new Error(`${name}: 짝이 없는 {{/${type}}}입니다.`);
      stack.pop();
    }
  }

  if (stack.length > 1) throw new Error(`${name}: 닫히지 않은 {{#${stack[stack.length - 1].node.type}}}이 있습니다.`);
  if (last < source.length) root.push({ type: 'text', value: source.slice(last) });
  return root;
}

function lookup(pathName, scopes) {
  if (pathName === 'this') return scopes[scopes.length - 1];
  const [head, ...rest] = pathName.split('.');
  for (let i = scopes.length - 1; i >= 0; i -= 1) {
    const scope = scopes[i];
    if (scope !== null && typeof scope === 'object' && Object.hasOwn(scope, head)) {
      return rest.reduce((value, key) => (value !== null && typeof value === 'object' && Object.hasOwn(value, key) ? value[key] : undefined), scope[head]);
    }
  }
  return undefined;
}

const isTruthy = (value) => (Array.isArray(value) ? value.length > 0 : Boolean(value));

function renderNodes(nodes, scopes, name) {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.value;
      const value = lookup(node.path, scopes);
      if (node.type === 'var') {
        if (value === undefined || value === null) throw new Error(`${name}: 변수 ${node.path}의 값이 없습니다.`);
        return node.raw ? String(value) : escapeHtml(value);
      }
      if (node.type === 'if') return renderNodes(isTruthy(value) ? node.body : node.otherwise, scopes, name);
      if (!Array.isArray(value)) throw new Error(`${name}: ${node.path}는 배열이어야 합니다.`);
      return value.map((item) => renderNodes(node.body, [...scopes, item], name)).join('');
    })
    .join('');
}

function renderTemplate(source, data, name = 'template') {
  return renderNodes(parseTemplate(source, name), [data], name);
}

module.exports = { renderTemplate };
