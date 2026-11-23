// 화면이 그려지기 전에 저장된 테마를 적용하도록 <head>에서 동기 로드한다.
(function () {
  var STORAGE_KEY = 'theme';
  var root = document.documentElement;
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  function readTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      // 저장할 수 없어도 현재 페이지의 전환은 유지한다.
    }
  }

  function currentTheme() {
    return root.getAttribute('data-theme') || (systemDark.matches ? 'dark' : 'light');
  }

  var stored = readTheme();
  if (stored === 'light' || stored === 'dark') {
    root.setAttribute('data-theme', stored);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.querySelector('.site-nav');
    if (!nav) return;

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-toggle';

    function updateLabel() {
      button.textContent = currentTheme() === 'dark' ? '라이트 모드' : '다크 모드';
    }

    button.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      saveTheme(next);
      updateLabel();
    });
    systemDark.addEventListener('change', updateLabel);

    updateLabel();
    nav.appendChild(button);
  });
})();
