// Tema claro/oscuro compartido por la página principal y Queens.
// Usa la misma clave que el sudoku (app.js), así la preferencia vale para toda la app.
const Theme = (() => {
  const KEY = 'sudoku_theme_v1';

  function isDark() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark') return true;
    if (attr === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function apply(theme, btn) {
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
    updateButton(btn);
  }

  function updateButton(btn) {
    const dark = isDark();
    if (btn) {
      btn.textContent = dark ? '☀️' : '🌙';
      btn.title = dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#14161a' : '#f4f5f7');
  }

  function bind(btn) {
    let saved = '';
    try { saved = localStorage.getItem(KEY) || ''; } catch (e) { /* localStorage no disponible */ }
    apply(saved, btn);
    btn.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (e) { /* localStorage no disponible */ }
      apply(next, btn);
    });
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (!document.documentElement.getAttribute('data-theme')) updateButton(btn);
      });
    }
  }

  return { bind, isDark };
})();
