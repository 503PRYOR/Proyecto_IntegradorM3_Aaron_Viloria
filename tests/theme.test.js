import { afterEach, describe, expect, it, vi } from 'vitest';
import { initTheme } from '../src/theme.js';

function createButton() {
  const listeners = {};
  const attributes = {};
  return {
    addEventListener(type, callback) {
      listeners[type] = callback;
    },
    click() {
      listeners.click();
    },
    setAttribute(name, value) {
      attributes[name] = value;
    },
    attributes,
  };
}

function setupTheme(savedTheme = null) {
  const button = createButton();
  const root = { dataset: {} };
  const storage = {
    getItem: vi.fn(() => savedTheme),
    setItem: vi.fn(),
  };

  vi.stubGlobal('document', {
    documentElement: root,
    getElementById: () => button,
  });
  vi.stubGlobal('localStorage', storage);
  initTheme();

  return { button, root, storage };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('theme toggle', () => {
  it('starts in dark mode when no preference has been saved', () => {
    const { button, root, storage } = setupTheme();

    expect(root.dataset.theme).toBe('dark');
    expect(button.attributes['aria-label']).toBe('Cambiar a modo claro');
    expect(button.attributes['aria-pressed']).toBe('false');
    expect(storage.getItem).toHaveBeenCalledWith('tesla-chat-theme');
  });

  it('restores a saved light theme', () => {
    const { button, root } = setupTheme('light');

    expect(root.dataset.theme).toBe('light');
    expect(button.attributes['aria-label']).toBe('Cambiar a modo oscuro');
    expect(button.attributes['aria-pressed']).toBe('true');
  });

  it('toggles and saves the selected theme', () => {
    const { button, root, storage } = setupTheme();

    button.click();
    expect(root.dataset.theme).toBe('light');
    expect(storage.setItem).toHaveBeenLastCalledWith('tesla-chat-theme', 'light');

    button.click();
    expect(root.dataset.theme).toBe('dark');
    expect(storage.setItem).toHaveBeenLastCalledWith('tesla-chat-theme', 'dark');
  });
});
