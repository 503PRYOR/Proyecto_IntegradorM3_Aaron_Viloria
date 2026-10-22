import { resolveRoute } from './utils.js';
import { initChat } from './chat.js';

// Actualizado con el nuevo nombre del proyecto/personaje
const TITLES = {
  home: 'Tesla Chat · Inicio',
  chat: 'Tesla Chat · Conversación',
  about: 'Tesla Chat · Acerca de Nikola Tesla',
};

const views = document.querySelectorAll('[data-view]');
const links = document.querySelectorAll('a[data-link]');

function showView(view) {
  views.forEach((el) => {
    el.hidden = el.dataset.view !== view;
  });
  links.forEach((link) => {
    const active = link.getAttribute('href') === `/${view}`;
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.title = TITLES[view];
  document.body.dataset.view = view;
}

/** Cambia de ruta sin recargar la página. */
function navigate(path, { replace = false } = {}) {
  const view = resolveRoute(path) ?? 'home';
  const target = `/${view}`;
  if (replace) history.replaceState({ view }, '', target);
  else if (location.pathname !== target) history.pushState({ view }, '', target);
  showView(view);
  window.scrollTo(0, 0);
}

// Intercepta clics en links internos.
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-link]');
  if (!link) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  navigate(link.getAttribute('href'));
});

// Botones atrás/adelante del navegador.
window.addEventListener('popstate', () => {
  showView(resolveRoute(location.pathname) ?? 'home');
});

// Render inicial según la URL actual (normaliza "/" y rutas desconocidas).
navigate(location.pathname, { replace: true });
initChat();