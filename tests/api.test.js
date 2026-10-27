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

function createGeminiResponse(data, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => data,
  };
}

describe('API handler', () => {
  beforeEach(async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(createGeminiResponse(
        { error: { message: 'High demand' } },
        { ok: false, status: 503 },
      )),
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

  it('usa generateContent una vez e informa cuando Gemini está ocupado', async () => {
    const res = createResponse();

    await handler({ method: 'POST', body: { messages: [{ role: 'user', text: 'Hola' }] } }, res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/muy ocupado/i);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=test-key',
    );
    const payload = JSON.parse(request.body);
    expect(payload.contents).toEqual([{ role: 'user', parts: [{ text: 'Hola' }] }]);
    expect(payload.systemInstruction.parts[0].text).toBeTruthy();
    expect(payload.generationConfig).toBeUndefined();
  });

  it('no reintenta con otro modelo si el modelo del demo no está disponible', async () => {
    fetch.mockResolvedValueOnce(createGeminiResponse(
      { error: { message: 'Model not found' } },
      { ok: false, status: 404 },
    ));
    const res = createResponse();

    await handler({ method: 'POST', body: { messages: [{ role: 'user', text: 'Hola' }] } }, res);

    expect(res.statusCode).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain('gemini-3.5-flash-lite:generateContent');
  });

  it('explains when Gemini exhausted the quota without trying fallback models', async () => {
    fetch.mockResolvedValueOnce(createGeminiResponse({
        error: {
          status: 'RESOURCE_EXHAUSTED',
          message: 'You exceeded your current quota. Check billing details.',
        },
      }, { ok: false, status: 429 }));
    const res = createResponse();

    await handler({ method: 'POST', body: { messages: [{ role: 'user', text: 'Hola' }] } }, res);

    expect(res.statusCode).toBe(429);
    expect(res.body.error).toMatch(/cuota de Gemini/i);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('devuelve el texto completo como JSON desde generateContent', async () => {
    fetch.mockResolvedValueOnce(createGeminiResponse({
      candidates: [{ content: { parts: [{ text: 'Hola' }] } }],
    }));
    const res = createResponse();

    await handler({ method: 'POST', body: { messages: [{ role: 'user', text: 'Hola' }] } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ reply: 'Hola' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
