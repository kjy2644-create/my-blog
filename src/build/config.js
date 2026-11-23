'use strict';

function normalizeBasePath(value = '') {
  const trimmed = String(value).trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}` : '';
}

module.exports = {
  title: '나의 블로그',
  description: '생각과 배움을 기록하는 블로그',
  // 하위 경로에 배포할 때 BASE_PATH 환경 변수로 지정한다. 예: BASE_PATH=/my-blog
  basePath: normalizeBasePath(process.env.BASE_PATH),
  normalizeBasePath,
};
