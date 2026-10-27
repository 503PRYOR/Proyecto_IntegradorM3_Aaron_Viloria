import { afterEach, describe, it, expect, vi } from 'vitest';
import { initChat, requestReply } from '../src/chat.js';

const history = [{ role: 'user', text: 'Hola', time: '10:00' }];

function createElement() {
  const listeners = {};
  return {
    children: [],
    disabled: false,
    hidden: false,
    scrollHeight: 0,
    scrollTop: 0,
    style: {},
    textContent: '',
    value: '',
    addEventListener(type, callback) {
      listeners[type] = callback;
    },
    append(...children) {
      this.children.push(...children);
    },
    focus() {},
    submit() {
      listeners.submit({ preventDefault() {} });
    },
  };
}

function createChatDocument() {
  const elements = new Map([
    ['messages', createElement()],
    ['chat-form', createElement()],
    ['chat-input', createElement()],
    ['send-btn', createElement()],
    ['typing', createElement()],
    ['chat-error', createElement()],
    ['chat-error-text', createElement()],
    ['retry-btn', createElement()],
  ]);
  return {
    elements,
    getElementById: (id) => elements.get(id),
    createElement,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockResponse({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

describe('chat submissions', () => {
  it('sends only one request when submitted again while the first is pending', async () => {
    const document = createChatDocument();
    const input = document.getElementById('chat-input');
    input.value = 'Primer mensaje';
    vi.stubGlobal('document', document);

    let resolveFetch;
    const fetchMock = vi.fn(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal('fetch', fetchMock);
    initChat();

    const form = document.getElementById('chat-form');
    form.submit();
    input.value = 'Segundo mensaje';
    form.submit();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(mockResponse({ body: { reply: 'Respuesta' } }));
    await vi.waitFor(() => expect(input.disabled).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('requestReply (fetch mockeado)', () => {
  it('envía el historial por POST y devuelve la respuesta', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ body: { reply: 'Elemental.' } }));

    const reply = await requestReply(history, fetchMock);

    expect(reply).toBe('Elemental.');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/functions');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ messages: [{ role: 'user', text: 'Hola' }] });
  });

  it('lanza el mensaje de error que devuelve el servidor', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockResponse({ ok: false, status: 502, body: { error: 'Gemini caído' } }));

    await expect(requestReply(history, fetchMock)).rejects.toThrow('Gemini caído');
  });

  it('lee el JSON de respuesta aunque el body HTTP exponga un lector', async () => {
    const getReader = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader },
      json: async () => ({ reply: 'Elemental.' }),
    });
    const received = [];

    const reply = await requestReply(history, fetchMock, (chunk, full) => received.push([chunk, full]));

    expect(reply).toBe('Elemental.');
    expect(received).toEqual([['Elemental.', 'Elemental.']]);
    expect(getReader).not.toHaveBeenCalled();
  });

  it('no repite automáticamente una solicitud cuando el servidor responde 503', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ ok: false, status: 503, body: { error: 'Saturado' } }),
    );

    await expect(requestReply(history, fetchMock)).rejects.toThrow('Saturado');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('propaga errores de red', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    await expect(requestReply(history, fetchMock)).rejects.toThrow('Failed to fetch');
  });

  it('rechaza una respuesta exitosa vacía', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ body: '' }));
    await expect(requestReply(history, fetchMock)).rejects.toThrow(/no devolvió respuesta/i);
  });

  it('rechaza JSON exitoso sin el campo reply', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ body: {} }));
    await expect(requestReply(history, fetchMock)).rejects.toThrow(/no devolvió respuesta/i);
  });
});
