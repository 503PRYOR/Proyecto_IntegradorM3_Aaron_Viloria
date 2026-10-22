  // Vercel Serverless Function: proxy seguro entre el frontend y Gemini.
  // La API key solo existe como variable de entorno del servidor.
  import { SYSTEM_PROMPT } from '../lib/systemPrompt.js';
  import {
    toGeminiContents,
    parseGeminiResponse,
    validateMessages,
  } from '../src/utils.js';

  const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  export default async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Método no permitido.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'El servidor no tiene configurada la API key.' });
    }

    const { messages } = req.body ?? {};
    const validation = validateMessages(messages);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: toGeminiContents(messages),
          generationConfig: { temperature: 0.9, maxOutputTokens: 2048 },
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        console.error('Error de Gemini:', response.status, data?.error?.message);
        return res.status(502).json({ error: 'Gemini no pudo responder. Intenta de nuevo.' });
      }

      return res.status(200).json({ reply: parseGeminiResponse(data) });
    } catch (error) {
      console.error('Error en la función:', error.message);
      return res.status(502).json({ error: 'No se pudo obtener respuesta del personaje.' });
    }
  }
