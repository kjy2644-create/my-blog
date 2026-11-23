'use strict';

const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const { loadPosts } = require('./posts');
const { renderMarkdown } = require('./markdown');
const { renderTemplate } = require('./template');

const ROOT = path.resolve(__dirname, '..', '..');

function formatDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function buildSite({ root = ROOT, site = config } = {}) {
  const readTemplate = (name) => fs.readFileSync(path.join(root, 'templates', name), 'utf8');
  const layout = readTemplate('layout.html');
  const indexTemplate = readTemplate('index.html');
  const postTemplate = readTemplate('post.html');
  const notFoundTemplate = readTemplate('404.html');

  const renderPage = (template, name, data, pageTitle, pageDescription) =>
    renderTemplate(
      layout,
      { site, pageTitle, pageDescription, body: renderTemplate(template, { site, ...data }, name) },
      'layout.html',
    );

  const posts = loadPosts(path.join(root, 'posts')).map((post) => ({
    ...post,
    url: `${site.basePath}/posts/${encodeURIComponent(post.slug)}/`,
    displayDate: formatDate(post.date),
    content: renderMarkdown(post.body, { basePath: site.basePath }),
  }));

  // 렌더링 오류가 나면 기존 dist를 지우지 않도록 모든 페이지를 만든 뒤 쓴다.
  const pages = [
    ['index.html', renderPage(indexTemplate, 'index.html', { posts }, site.title, site.description)],
    ['404.html', renderPage(notFoundTemplate, '404.html', {}, `페이지를 찾을 수 없습니다 - ${site.title}`, site.description)],
    ...posts.map((post) => [
      path.join('posts', post.slug, 'index.html'),
      renderPage(postTemplate, 'post.html', { post }, `${post.title} - ${site.title}`, post.description || site.description),
    ]),
  ];

  const outDir = path.join(root, 'dist');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const publicDir = path.join(root, 'public');
  if (fs.existsSync(publicDir)) {
    fs.cpSync(publicDir, outDir, {
      recursive: true,
      filter: (source) => path.basename(source) !== '.DS_Store',
    });
  }

  for (const [relativePath, html] of pages) {
    const target = path.join(outDir, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, html);
  }

  return { outDir, postCount: posts.length };
}

if (require.main === module) {
  try {
    const { postCount } = buildSite();
    console.log(`빌드 완료: 글 ${postCount}편을 dist/에 생성했습니다.`);
  } catch (error) {
    console.error(`빌드 실패: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { buildSite };
