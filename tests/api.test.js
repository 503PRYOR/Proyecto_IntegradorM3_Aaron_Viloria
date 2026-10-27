import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let handler;

function createResponse() {
  return {
    statusCode: null,
    body: null,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    write(chunk) {
      this.body = (this.body || '') + chunk;
    },
    end() {
      this.ended = true;
    },
    json(body) {
      this.body = body;
      return this;
    },
    setHeader() {},
  };
}

function createGeminiStream(text) {
  const encoder = new TextEncoder();
  const value = encoder.encode(
    `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\r\n\r\n`,
  );
  let sent = false;

  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true };
          sent = true;
          return { done: false, value };
        },
        releaseLock() {},
      }),
    },
  };
}

describe('API handler', () => {
  beforeEach(async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubEnv('GEMINI_MODEL', 'gemini-3.8-flash');
    vi.stubEnv('GEMINI_MODELS', '');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: 'High demand' } }),
      }),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.resetModules();
    ({ default: handler } = await import('../api/functions.js'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('informa cuando Gemini está ocupado', async () => {
    const res = createResponse();

    await handler({ method: 'POST', body: { messages: [{ role: 'user', text: 'Hola' }] } }, res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/muy ocupado/i);
    const [, request] = fetch.mock.calls[0];
    const payload = JSON.parse(request.body);
    expect(payload.generationConfig.maxOutputTokens).toBe(1024);
    expect(payload.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
  });

  it('usa un modelo de respaldo si el configurado no está disponible', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'Model not found' } }),
      })
      .mockResolvedValueOnce(createGeminiStream('Respuesta de respaldo'));
    const res = createResponse();

    await handler({ method: 'POST', body: { messages: [{ role: 'user', text: 'Hola' }] } }, res);

    expect(res.body).toBe('Respuesta de respaldo');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toContain('gemini-3.6-flash');
  });

  it('pasa a un modelo de respaldo si el principal está temporalmente ocupado', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: 'High demand' } }),
      })
      .mockResolvedValueOnce(createGeminiStream('Respuesta de respaldo'));
    const res = createResponse();

    await handler({ method: 'POST', body: { messages: [{ role: 'user', text: 'Hola' }] } }, res);

    expect(res.body).toBe('Respuesta de respaldo');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toContain('gemini-3.6-flash');
  });

  it('explains when Gemini exhausted the quota without trying fallback models', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          status: 'RESOURCE_EXHAUSTED',
          message: 'You exceeded your current quota. Check billing details.',
        },
      }),
    });
    const res = createResponse();

    await handler({ method: 'POST', body: { messages: [{ role: 'user', text: 'Hola' }] } }, res);

    expect(res.statusCode).toBe(429);
    expect(res.body.error).toMatch(/cuota de Gemini/i);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('streams Gemini text from SSE events, including delimiters split across chunks', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hola"}]}}]}\r\n',
      '\r\n',
    ];
    let index = 0;
    fetch.mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => (
            index < chunks.length
              ? { done: false, value: encoder.encode(chunks[index++]) }
              : { done: true }
          ),
          releaseLock() {},
        }),
      },
    });
    const res = createResponse();

    await handler({ method: 'POST', body: { messages: [{ role: 'user', text: 'Hola' }] } }, res);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(':streamGenerateContent?alt=sse&key=test-key'),
      expect.any(Object),
    );
    expect(res.body).toBe('Hola');
    expect(res.ended).toBe(true);
  });
});
