// Vercel Serverless Function: proxy seguro entre el frontend y Gemini.
// La API key solo existe como variable de entorno del servidor.
import { SYSTEM_PROMPT } from '../lib/systemPrompt.js';
import { toGeminiContents, validateMessages } from '../src/utils.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Modelos del entorno + respaldos fijos (sin repetir).
// Así, aunque GEMINI_MODEL tenga un solo modelo, siempre hay fallback.
const FALLBACK_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
const fromEnv = (process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || '')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const MODELS = [...new Set([...fromEnv, ...FALLBACK_MODELS])];

// Solo 500/503/504 se reintentan en el MISMO modelo.
// 429 (cuota agotada) salta directo al siguiente modelo.
const RETRYABLE = [500, 503, 504];
const BUSY = [429, 503];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function generationConfig(model) {
  return {
    temperature: 0.9,
    maxOutputTokens: 1024,
    thinkingConfig: model.startsWith('gemini-3')
      ? { thinkingLevel: 'LOW' }
      : { thinkingBudget: 0 }, // modelos 2.5: sin "pensar" = más rápido
  };
}

// Prueba cada modelo hasta que uno responda con éxito
async function openStream(messages) {
  let lastStatus = 0;
  let sawBusy = false;

  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(`${BASE}/${model}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: toGeminiContents(messages),
            generationConfig: generationConfig(model),
          }),
          signal: AbortSignal.timeout(25000),
        });

        if (response.ok) return response;

        lastStatus = response.status;
        if (BUSY.includes(response.status)) sawBusy = true;
        const data = await response.json().catch(() => null);
        const upstreamError = data?.error;
        const errorDetails = `${upstreamError?.status || ''} ${upstreamError?.message || ''}`;
        console.error(`Gemini ${model}:`, response.status, errorDetails);
        if (response.status === 429 && /quota|billing|exceeded|resource_exhausted/i.test(errorDetails)) {
          const quotaError = new Error('Gemini quota exceeded');
          quotaError.status = 429;
          quotaError.quota = true;
          throw quotaError;
        }

        // 429, 400, 404...: reintentar este modelo no sirve, pasa al siguiente
        if (!RETRYABLE.includes(response.status)) break;
        await sleep(300 * (attempt + 1));
      } catch (err) {
        if (err.quota) throw err;
        console.error(`Gemini ${model} falló:`, err.message);
        await sleep(300);
      }
    }
  }

  const error = new Error('Gemini no disponible');
  error.status = lastStatus;
  error.busy = sawBusy;
  throw error;
}

// Convierte el stream SSE de Gemini en fragmentos de texto
async function* textChunks(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Gemini no devolvió un flujo de respuesta.');

  const decoder = new TextDecoder();
  let buffer = '';

  function parseEvent(event) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data || data === '[DONE]') return '';

    let json;
    try {
      json = JSON.parse(data);
    } catch {
      throw new Error('Gemini devolvió un evento de streaming inválido.');
    }
    if (json.error) {
      throw new Error(json.error.message || 'Gemini devolvió un error de streaming.');
    }

    return (json.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || '')
      .join('');
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const event = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const text = parseEvent(event);
        if (text) yield text;
      }

      if (done) {
        if (buffer.trim()) {
          const text = parseEvent(buffer);
          if (text) yield text;
        }
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'El servidor no tiene configurada la API key.' });
  }

  const { messages } = req.body ?? {};
  const validation = validateMessages(messages);
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const response = await openStream(messages.slice(-10));
    const chunks = textChunks(response);

    // Esperamos el primer texto ANTES de enviar headers
    const first = await chunks.next();
    if (first.done) {
      const err = new Error('Respuesta vacía de Gemini');
      err.status = 503;
      err.busy = true;
      throw err;
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.write(first.value);
    for await (const text of chunks) res.write(text);
    return res.end();
  } catch (error) {
    console.error('Error en la función:', error.message);
    if (res.headersSent) return res.end();

    if (error.quota) {
      return res.status(429).json({
        error: 'Se agotó la cuota de Gemini para este proyecto. Revisa los límites de uso y la facturación del proyecto asociado a la API key, o espera a que se restablezca la cuota.',
      });
    }

    return res.status(error.busy ? 503 : 502).json({
      error: error.busy
        ? 'El servicio está muy ocupado. Inténtalo de nuevo en unos segundos.'
        : 'No se pudo obtener respuesta del personaje.',
    });
  }
}