import { describe, it, expect, vi } from 'vitest';
import { requestReply } from '../src/chat.js';

const history = [{ role: 'user', text: 'Hola', time: '10:00' }];

function mockResponse({ ok = true, status = 200, body = {} } = {}) {
  return { ok, status, json: async () => body };
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

  it('muestra el error del servidor incluso si la respuesta HTTP es exitosa', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockResponse({ body: { error: 'Modelo no disponible' } }));

    await expect(requestReply(history, fetchMock)).rejects.toThrow('Modelo no disponible');
  });

  it('propaga errores de red', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    await expect(requestReply(history, fetchMock)).rejects.toThrow('Failed to fetch');
  });

  it('identifica una respuesta exitosa sin el campo "reply"', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ body: {} }));
    await expect(requestReply(history, fetchMock)).rejects.toThrow(/HTTP 200.*reply/);
  });

  it('identifica una respuesta exitosa con JSON inválido', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('JSON inválido');
      },
    });

    await expect(requestReply(history, fetchMock)).rejects.toThrow(/HTTP 200.*JSON válido/);
  });
});
