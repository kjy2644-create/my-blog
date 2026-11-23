'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { describe, it } = require('node:test');
const { normalizeBasePath } = require('../src/build/config');
const { buildSite } = require('../src/build/index');
const { parsePost } = require('../src/build/posts');
const { createDevServer } = require('../src/build/serve');
const { renderTemplate } = require('../src/build/template');

const PROJECT = path.resolve(__dirname, '..');
const SITE = { title: '테스트', description: '설명', basePath: '' };

function makeSite(t, posts) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(PROJECT, 'templates'), path.join(root, 'templates'), { recursive: true });
  fs.cpSync(path.join(PROJECT, 'public'), path.join(root, 'public'), { recursive: true });
  fs.mkdirSync(path.join(root, 'posts'));
  for (const [name, source] of Object.entries(posts)) fs.writeFileSync(path.join(root, 'posts', name), source);
  return root;
}

const post = (title, date, extra = '') => `---\ntitle: ${title}\ndate: ${date}\n${extra}---\n\n본문`;
const read = (root, ...parts) => fs.readFileSync(path.join(root, 'dist', ...parts), 'utf8');

function request(port, requestPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, path: requestPath, method, host: '127.0.0.1' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('front matter', () => {
  it('값을 해석한다', () => {
    const result = parsePost('---\ntitle: "제목: 부제"\ndate: 2026-01-02\ntags: [가, "나, 다"]\n---\n본문', 'a.md');
    assert.equal(result.title, '제목: 부제');
    assert.deepEqual(result.tags, ['가', '나, 다']);
    assert.equal(result.body, '본문');
    assert.equal(result.draft, false);
  });

  it('대괄호로 시작하는 제목을 배열로 바꾸지 않는다', () => {
    assert.equal(parsePost(post('[공지] 안내', '2026-01-02'), 'a.md').title, '[공지] 안내');
  });

  it('잘못된 글은 파일명을 포함해 실패한다', () => {
    assert.throws(() => parsePost('본문만', 'none.md'), /none\.md/);
    assert.throws(() => parsePost('---\ndate: 2026-01-01\n---\n', 'no-title.md'), /no-title\.md.*title/);
    assert.throws(() => parsePost('---\ntitle: 가\n---\n', 'no-date.md'), /no-date\.md.*date/);
    assert.throws(() => parsePost(post('가', '2026-02-30'), 'bad-date.md'), /bad-date\.md/);
    assert.throws(() => parsePost(post('가', '2026-01-01', 'draft: ture\n'), 'bad-draft.md'), /bad-draft\.md/);
  });
});

describe('템플릿', () => {
  it('자동 이스케이프와 원본 삽입', () => {
    assert.equal(renderTemplate('{{a}}|{{{a}}}', { a: '<b>' }), '&lt;b&gt;|<b>');
  });

  it('치환된 값을 다시 해석하지 않는다', () => {
    assert.equal(renderTemplate('{{{a}}}', { a: '{{b}}', b: 'x' }), '{{b}}');
  });

  it('조건과 반복', () => {
    const source = '{{#each items}}{{#if on}}{{name}}{{else}}-{{/if}}{{suffix}}{{/each}}';
    assert.equal(renderTemplate(source, { suffix: '!', items: [{ on: true, name: '가' }, { on: false }] }), '가!-!');
  });

  it('없는 변수는 오류다', () => {
    assert.throws(() => renderTemplate('{{missing}}', {}, 'x.html'), /x\.html.*missing/);
  });
});

describe('사이트 빌드', () => {
  it('목록을 날짜순으로 만들고 초안을 제외한다', (t) => {
    const root = makeSite(t, {
      'old.md': post('오래된 글', '2026-01-01'),
      'new.md': post('새 글', '2026-03-01'),
      'secret.md': post('초안 글', '2026-04-01', 'draft: true\n'),
    });
    const { postCount } = buildSite({ root, site: SITE });
    const index = read(root, 'index.html');

    assert.equal(postCount, 2);
    assert.ok(index.indexOf('새 글') < index.indexOf('오래된 글'));
    assert.ok(!index.includes('초안 글'));
    assert.ok(!fs.existsSync(path.join(root, 'dist', 'posts', 'secret')));
    assert.ok(read(root, 'posts', 'new', 'index.html').includes('<time datetime="2026-03-01">2026년 3월 1일</time>'));
    assert.ok(fs.existsSync(path.join(root, 'dist', 'style.css')));
  });

  it('제목과 태그를 이스케이프한다', (t) => {
    const root = makeSite(t, { 'x.md': post('<script>a</script>', '2026-01-01', 'tags: ["<b>태그</b>"]\n') });
    buildSite({ root, site: SITE });
    for (const html of [read(root, 'index.html'), read(root, 'posts', 'x', 'index.html')]) {
      assert.ok(!html.includes('<script>a'));
      assert.ok(!html.includes('<b>태그'));
    }
  });

  it('한글 파일명을 인코딩하고 basePath를 적용한다', (t) => {
    const root = makeSite(t, { '안녕.md': post('가', '2026-01-01') });
    buildSite({ root, site: { ...SITE, basePath: '/blog' } });
    const index = read(root, 'index.html');
    assert.ok(index.includes(`href="/blog/posts/${encodeURIComponent('안녕')}/"`));
    assert.ok(index.includes('href="/blog/style.css"'));
  });

  it('빌드가 실패하면 기존 결과물을 유지한다', (t) => {
    const root = makeSite(t, { 'a.md': post('가', '2026-01-01') });
    buildSite({ root, site: SITE });
    fs.writeFileSync(path.join(root, 'posts', 'broken.md'), '---\ntitle: 나\n---\n');
    assert.throws(() => buildSite({ root, site: SITE }), /broken\.md/);
    assert.ok(fs.existsSync(path.join(root, 'dist', 'index.html')));
  });
});

describe('배포 경로', () => {
  it('BASE_PATH 값을 정규화한다', () => {
    for (const value of [undefined, '', '/']) assert.equal(normalizeBasePath(value), '');
    for (const value of ['my-blog', '/my-blog', '/my-blog/']) assert.equal(normalizeBasePath(value), '/my-blog');
  });

  it('404 페이지의 링크에 basePath를 적용한다', (t) => {
    const root = makeSite(t, { 'a.md': post('가', '2026-01-01') });
    buildSite({ root, site: { ...SITE, basePath: '/blog' } });
    const html = read(root, '404.html');
    assert.ok(html.includes('href="/blog/style.css"'));
    assert.ok(html.includes('<a href="/blog/">← 목록으로</a>'));
  });
});

describe('개발 서버', () => {
  it('파일 제공, 리다이렉트, 경로 차단', async (t) => {
    const root = makeSite(t, { 'a.md': post('서버 글', '2026-01-01') });
    const { outDir } = buildSite({ root, site: SITE });
    fs.writeFileSync(path.join(root, 'secret.txt'), 'secret');

    const server = createDevServer(outDir);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const { port } = server.address();

    const page = await request(port, '/posts/a/');
    assert.equal(page.status, 200);
    assert.match(page.headers['content-type'], /text\/html/);
    assert.ok(page.body.includes('서버 글'));

    const redirect = await request(port, '//posts/a');
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.location, '/posts/a/');

    for (const attack of ['/../secret.txt', '/%2e%2e/secret.txt', '/posts/..%2f..%2fsecret.txt']) {
      const response = await request(port, attack);
      assert.equal(response.status, 404, attack);
      assert.ok(!response.body.includes('secret'));
    }

    assert.equal((await request(port, '/%E0%A4%A')).status, 400);
    assert.equal((await request(port, '/', 'POST')).status, 405);
    const missing = await request(port, '/none');
    assert.equal(missing.status, 404);
    assert.ok(missing.body.includes('페이지를 찾을 수 없습니다'));
  });
});
