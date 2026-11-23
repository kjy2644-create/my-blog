'use strict';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

// 브라우저는 URL의 제어 문자를 무시하므로 제거한 뒤 스킴을 검사한다.
function sanitizeUrl(url, allowedSchemes) {
  const compact = String(url).replace(/[\u0000- \u007f-\u009f]/g, '');
  if (!compact) return '';
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
  if (scheme && !allowedSchemes.includes(scheme[1].toLowerCase())) return '';
  return compact;
}

function withBasePath(url, basePath) {
  return basePath && url.startsWith('/') && !url.startsWith('//') ? basePath + url : url;
}

module.exports = { escapeHtml, sanitizeUrl, withBasePath };
