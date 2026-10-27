// Vercel Serverless Function: proxy seguro entre el frontend y Gemini.
// La API key solo existe como variable de entorno del servidor.
import { SYSTEM_PROMPT } from '../lib/systemPrompt.js';
import { parseGeminiResponse, toGeminiContents, validateMessages } from '../src/utils.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-3.5-flash-lite';
const BUSY = [429, 503];
const MODEL_TIMEOUT_MS = 20000;

async function generateReply(messages) {
  const response = await fetch(`${BASE}/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: toGeminiContents(messages),
    }),
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const upstreamError = data?.error;
    const errorDetails = `${upstreamError?.status || ''} ${upstreamError?.message || ''}`;
    console.error(`Gemini ${MODEL}:`, response.status, errorDetails);
    if (response.status === 429 && /quota|billing|exceeded|resource_exhausted/i.test(errorDetails)) {
      const quotaError = new Error('Gemini quota exceeded');
      quotaError.status = 429;
      quotaError.quota = true;
      throw quotaError;
    }

    const error = new Error('Gemini no disponible');
    error.status = response.status;
    error.busy = BUSY.includes(response.status);
    throw error;
  }

  return parseGeminiResponse(data);
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
    const reply = await generateReply(messages.slice(-10));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ reply });
  } catch (error) {
    console.error('Error en la función:', error.message);
    if (error.quota) {
      return res.status(429).json({
        error: 'Se agotó la cuota de Gemini para este proyecto. Revisa los límites de uso y la facturación del proyecto asociado a la API key, o espera a que se restablezca la cuota.',
      });
    }

    const busy = error.busy || error.name === 'TimeoutError' || error.name === 'AbortError';
    return res.status(busy ? 503 : 502).json({
      error: busy
        ? 'El servicio está muy ocupado. Inténtalo de nuevo en unos segundos.'
        : 'No se pudo obtener respuesta del personaje.',
    });
  }
}
