import { describe, it, expect, vi } from 'vitest';
import { requestReply } from '../src/chat.js';

const history = [{ role: 'user', text: 'Hola', time: '10:00' }];

function mockResponse({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

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

  it('lee la respuesta en streaming y notifica los fragmentos recibidos', async () => {
    const encoder = new TextEncoder();
    const chunks = ['Ele', 'mental.'];
    let index = 0;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => (
            index < chunks.length
              ? { done: false, value: encoder.encode(chunks[index++]) }
              : { done: true }
          ),
        }),
      },
    });
    const received = [];

    const reply = await requestReply(history, fetchMock, (chunk, full) => received.push([chunk, full]));

    expect(reply).toBe('Elemental.');
    expect(received).toEqual([['Ele', 'Ele'], ['mental.', 'Elemental.']]);
  });

  it('reintenta una vez cuando Gemini responde con 503', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 503, body: { error: 'Saturado' } }))
      .mockResolvedValueOnce(mockResponse({ body: { reply: 'Elemental.' } }));

    try {
      const replyPromise = requestReply(history, fetchMock);
      await vi.advanceTimersByTimeAsync(500);

      await expect(replyPromise).resolves.toBe('Elemental.');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('propaga errores de red', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    await expect(requestReply(history, fetchMock)).rejects.toThrow('Failed to fetch');
  });

  it('rechaza una respuesta exitosa vacía', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ body: '' }));
    await expect(requestReply(history, fetchMock)).rejects.toThrow(/no devolvió respuesta/i);
  });

  it('acepta texto plano como respuesta de respaldo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ body: 'Respuesta en texto plano.' }));

    await expect(requestReply(history, fetchMock)).resolves.toBe('Respuesta en texto plano.');
  });
});
