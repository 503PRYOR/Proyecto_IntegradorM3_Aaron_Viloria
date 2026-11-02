const STORAGE_KEY = 'tesla-chat-theme';

export function initTheme() {
  const button = document.getElementById('theme-toggle');
  const root = document.documentElement;

  function applyTheme(theme) {
    const isLight = theme === 'light';
    root.dataset.theme = isLight ? 'light' : 'dark';
    button.setAttribute('aria-label', isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
    button.setAttribute('aria-pressed', String(isLight));
  }

  const savedTheme = localStorage.getItem(STORAGE_KEY);
  applyTheme(savedTheme === 'light' ? 'light' : 'dark');

  button.addEventListener('click', () => {
    const theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  });
}
