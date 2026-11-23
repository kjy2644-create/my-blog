'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { renderMarkdown: md } = require('../src/build/markdown');

describe('블록 문법', () => {
  it('제목과 문단', () => {
    assert.equal(md('# 제목\n\n문단 첫 줄\n둘째 줄'), '<h1>제목</h1>\n<p>문단 첫 줄\n둘째 줄</p>');
    assert.equal(md('###### 작은 제목 ##'), '<h6>작은 제목</h6>');
    assert.equal(md('#태그'), '<p>#태그</p>');
  });

  it('구분선', () => {
    for (const source of ['---', '***', '___', '- - -']) assert.equal(md(source), '<hr>');
  });

  it('코드 블록은 내용을 이스케이프하고 마크다운을 해석하지 않는다', () => {
    assert.equal(
      md('```js\nconst a = "<b>**x**</b>";\n```'),
      '<pre tabindex="0"><code class="language-js">const a = &quot;&lt;b&gt;**x**&lt;/b&gt;&quot;;\n</code></pre>',
    );
    assert.equal(md('````\n```\n````'), '<pre tabindex="0"><code>```\n</code></pre>');
  });

  it('코드 블록 언어 이름으로 속성을 탈출할 수 없다', () => {
    assert.ok(!md('```"><script>\nx\n```').includes('<script>'));
  });

  it('인용문과 중첩 인용문', () => {
    assert.equal(
      md('> 바깥\n>\n> > 안쪽'),
      '<blockquote>\n<p>바깥</p>\n<blockquote>\n<p>안쪽</p>\n</blockquote>\n</blockquote>',
    );
  });

  it('중첩 목록', () => {
    assert.equal(
      md('- 가\n  - 나\n    - 다\n- 라'),
      '<ul>\n<li>가\n<ul>\n<li>나\n<ul>\n<li>다</li>\n</ul></li>\n</ul></li>\n<li>라</li>\n</ul>',
    );
  });

  it('번호 목록 안의 2칸 들여쓰기 목록도 중첩한다', () => {
    assert.equal(
      md('1. 가\n  - 나\n  - 다\n2. 라'),
      '<ol>\n<li>가\n<ul>\n<li>나</li>\n<li>다</li>\n</ul></li>\n<li>라</li>\n</ol>',
    );
  });

  it('번호 목록의 시작 번호와 느슨한 목록', () => {
    assert.equal(md('3. 가\n4. 나'), '<ol start="3">\n<li>가</li>\n<li>나</li>\n</ol>');
    assert.equal(md('- 가\n\n- 나'), '<ul>\n<li><p>가</p></li>\n<li><p>나</p></li>\n</ul>');
  });

  it('목록 안의 코드 블록은 빈 줄을 유지한다', () => {
    assert.equal(
      md('- 가\n  ```\n  a\n\n  b\n  ```'),
      '<ul>\n<li>가\n<pre tabindex="0"><code>a\n\nb\n</code></pre></li>\n</ul>',
    );
  });

  it('문장 중간의 연도는 목록으로 끊지 않는다', () => {
    assert.equal(md('지난해는\n2025. 좋은 해였다'), '<p>지난해는\n2025. 좋은 해였다</p>');
  });

  it('표와 정렬', () => {
    const html = md('| 가 | 나 |\n| :-: | --: |\n| **1** | a\\|b |\n| 3 |');
    assert.ok(html.startsWith('<div class="table-wrap"'));
    assert.ok(html.includes('<th scope="col" class="align-center">가</th>'));
    assert.ok(html.includes('<td class="align-center"><strong>1</strong></td><td class="align-right">a|b</td>'));
    assert.ok(html.includes('<td class="align-center">3</td><td class="align-right"></td>'));
  });

  it('구분 행이 맞지 않으면 표가 아니다', () => {
    assert.equal(md('a | b\n--- | --- | ---'), '<p>a | b\n--- | --- | ---</p>');
  });
});

describe('인라인 문법', () => {
  it('굵게, 기울임, 인라인 코드', () => {
    assert.equal(md('**굵게** *기울임* `코드`'), '<p><strong>굵게</strong> <em>기울임</em> <code>코드</code></p>');
    assert.equal(md('***둘 다***'), '<p><em><strong>둘 다</strong></em></p>');
    assert.equal(md('`` a`b ``'), '<p><code>a`b</code></p>');
  });

  it('한글 조사가 붙은 강조', () => {
    assert.equal(md('**"강조"**는 됩니다'), '<p><strong>&quot;강조&quot;</strong>는 됩니다</p>');
  });

  it('강조로 해석하면 안 되는 경우', () => {
    assert.equal(md('2 * 3 * 4'), '<p>2 * 3 * 4</p>');
    assert.equal(md('snake_case_name'), '<p>snake_case_name</p>');
    assert.equal(md('\\*글자\\*'), '<p>*글자*</p>');
  });

  it('링크와 이미지', () => {
    assert.equal(md('[글](https://a.com/x_(y) "제목")'), '<p><a href="https://a.com/x_(y)" title="제목">글</a></p>');
    assert.equal(md('![대체 *글*](/a.png)'), '<p><img src="/a.png" alt="대체 글" loading="lazy"></p>');
    assert.equal(md('[![그림](a.png)](b)'), '<p><a href="b"><img src="a.png" alt="그림" loading="lazy"></a></p>');
  });

  it('basePath를 루트 경로에만 붙인다', () => {
    const options = { basePath: '/blog' };
    assert.equal(md('[a](/x)', options), '<p><a href="/blog/x">a</a></p>');
    assert.equal(md('[a](x)', options), '<p><a href="x">a</a></p>');
    assert.equal(md('[a](//cdn.test/x)', options), '<p><a href="//cdn.test/x">a</a></p>');
  });
});

describe('보안', () => {
  it('원본 HTML을 이스케이프한다', () => {
    assert.equal(md('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    assert.equal(md('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  });

  it('위험한 링크 스킴을 차단한다', () => {
    const urls = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      '<java\tscript:alert(1)>',
      '<\u0001javascript:alert(1)>',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:x',
    ];
    for (const url of urls) {
      const html = md(`[글](${url})`);
      assert.ok(!html.includes('<a '), `${url} => ${html}`);
    }
  });

  it('이미지의 위험한 스킴을 차단한다', () => {
    assert.equal(md('![대체](javascript:alert(1))'), '<p>대체</p>');
    assert.equal(md('![대체](data:image/svg+xml,x)'), '<p>대체</p>');
  });

  it('속성값을 탈출할 수 없다', () => {
    const link = md('[a](https://x.test/"onmouseover="alert(1))');
    assert.ok(link.includes('&quot;onmouseover=&quot;'));
    const title = md('[a](/x "t\\" onclick=\\"y")');
    assert.ok(!/ onclick="/.test(title));
    const alt = md('!["><script>](/a.png)');
    assert.ok(!alt.includes('<script>'));
  });
});
