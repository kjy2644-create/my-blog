# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

마크다운 파일을 읽어 정적 블로그 웹사이트로 변환하는 프로젝트다. 사용자에게 보이는 설명과 문서는 한국어로 작성한다.

> **현재 상태:** 첫 버전 구현 완료. 사이트 제목은 `src/build/config.js`에서, 배포 하위 경로는 `BASE_PATH` 환경 변수로 설정한다. `main`에 푸시하면 `.github/workflows/deploy.yml`이 테스트 후 GitHub Pages에 배포한다. 개발 서버는 시작할 때 한 번 빌드하므로 글을 고친 뒤에는 서버를 다시 시작한다.

## 기술 제약

- HTML, CSS, JavaScript만 사용한다.
- React, Vue, Next.js, Astro, Tailwind, Bootstrap 같은 UI·CSS 프레임워크와 정적 사이트 생성기를 쓰지 않는다.
- npm 런타임 의존성을 추가하지 않는다. 마크다운 파서도 직접 구현한다. 외부 패키지가 꼭 필요하면 먼저 사용자에게 확인한다.
- 빌드와 개발 서버는 Node.js 내장 모듈(`node:fs`, `node:path`, `node:http`)만 사용한다.
- 번들러와 트랜스파일러 없이, 작성한 CSS와 JS를 그대로 배포한다.

## 아키텍처

빌드 시점에 마크다운을 HTML로 변환한다. 덕분에 JavaScript 없이도 글을 읽을 수 있고 검색 엔진이 본문을 수집할 수 있다.

```text
posts/*.md → front matter 분리 → 마크다운 파싱 → 템플릿 적용 → dist/
```

디렉터리 구조:

```text
posts/       마크다운 원본 글
templates/   페이지 HTML 템플릿 (목록, 글 상세)
src/build/   빌드 파이프라인 (파서, 템플릿 렌더러, 페이지 생성)
public/      그대로 복사되는 CSS, 브라우저 JS, 이미지
tests/       node:test 기반 테스트
dist/        빌드 결과물 (직접 수정 금지, git 제외)
```

### 글 형식

파일명이 URL slug가 된다. `posts/hello-world.md`는 `/posts/hello-world/`로 출력한다.

```markdown
---
title: 글 제목
date: 2026-11-23
description: 목록과 메타 태그에 쓰는 요약
tags: [일상, 개발]
draft: false
---

본문
```

- `title`과 `date`는 필수이며, 누락되면 해당 파일명을 포함한 오류로 빌드를 실패시킨다.
- `draft: true`인 글은 출력에서 제외한다.
- 목록은 `date` 내림차순으로 정렬한다.

### 첫 버전 범위

- 포함: 글 목록 페이지, 글 상세 페이지, 다크 모드, 글의 태그 표시.
- 제외: 태그별 목록, 검색, 목차, 읽기 진행률, 코드 하이라이트, RSS. 사용자가 요청할 때 추가한다.
- 파서 지원 문법: 제목, 문단, 굵게, 기울임, 인라인 코드, 코드 블록, 링크, 이미지, 인용문, 중첩 목록, 표, 구분선.

### 보안 규칙

- 제목, 태그, 코드 블록 등 템플릿에 삽입하는 텍스트는 HTML 이스케이프한다.
- 링크와 이미지 URL에서 `javascript:` 같은 위험한 스킴을 차단한다.

### 브라우저 JavaScript

JavaScript는 점진적 향상에만 사용한다. 다크 모드 전환 같은 부가 기능이 동작하지 않아도 글 읽기와 페이지 이동은 가능해야 한다.

## 디자인 원칙

분위기는 미니멀 문서형이다. 깔끔하고 읽기 좋은 것이 최우선이며, 흰 배경과 절제된 강조색 하나를 쓰고 장식보다 타이포그래피와 여백으로 위계를 만든다.

- 본문 폭은 약 `68ch`, 줄 간격은 `1.75` 안팎, 글자 크기는 `17px`~`18px`로 한다.
- 한글 줄바꿈을 위해 본문에 `word-break: keep-all`과 `overflow-wrap: break-word`를 적용한다.
- 글꼴은 시스템 폰트 스택을 우선하며, 코드는 고정폭 글꼴을 사용한다.
- 색상, 간격, 글꼴은 `:root`의 CSS 변수로 정의하고 값을 하드코딩하지 않는다.
- `prefers-color-scheme`으로 라이트·다크 모드를 지원한다.
- 모바일 우선으로 작성하고, 긴 코드 블록과 표는 페이지 전체가 아니라 해당 요소 안에서 가로 스크롤되게 한다.
- `article`, `nav`, `time` 등 시맨틱 HTML을 사용하고 키보드 포커스 표시를 유지한다.

## 명령어

```bash
node src/build/index.js
```

```bash
node src/build/serve.js
```

```bash
node --test
```

```bash
node --test tests/markdown.test.js
```

순서대로 전체 빌드, 로컬 개발 서버 실행, 전체 테스트, 단일 테스트 파일 실행이다.
