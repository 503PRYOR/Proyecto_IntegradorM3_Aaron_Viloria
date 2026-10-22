// Funciones puras y reutilizables (frontend y serverless function).

export const MAX_MESSAGES = 50;
export const MAX_TEXT_LENGTH = 2000;

const ROUTES = {
  '/home': 'home',
  '/chat': 'chat',
  '/about': 'about',
};

/**
 * Devuelve el nombre de la vista para un pathname.
 * '/' => 'home' (se normaliza a /home). Ruta desconocida => null.
 */
export function resolveRoute(pathname) {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';
  if (clean === '/') return 'home';
  return ROUTES[clean] ?? null;
}

/**
 * Convierte mensajes de la UI ({ role: 'user' | 'character', text })
 * al formato de Gemini ({ role: 'user' | 'model', parts: [{ text }] }).
 * Gemini exige que la conversación empiece con el usuario, por eso
 * se descartan los mensajes iniciales del personaje (ej. el saludo).
 */
export function toGeminiContents(messages) {
  const contents = messages
    .filter((m) => typeof m.text === 'string' && m.text.trim() !== '')
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text.trim() }],
    }));

  while (contents.length && contents[0].role !== 'user') contents.shift();
  return contents;
}

/** Extrae el texto de la respuesta de Gemini o lanza un Error descriptivo. */
export function parseGeminiResponse(data) {
  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(`Gemini bloqueó la solicitud (${blockReason}).`);
  }

  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')
    .trim();

  if (!text) {
    const reason = candidate?.finishReason ?? 'desconocido';
    throw new Error(`Gemini no devolvió texto (motivo: ${reason}).`);
  }
  return text;
}

/** Valida el body recibido por la serverless function. */
export function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: 'Debes enviar un arreglo "messages" no vacío.' };
  }
  if (messages.length > MAX_MESSAGES) {
    return { ok: false, error: `Máximo ${MAX_MESSAGES} mensajes por conversación.` };
  }
  for (const m of messages) {
    const validRole = m && (m.role === 'user' || m.role === 'character');
    if (!validRole || typeof m.text !== 'string') {
      return { ok: false, error: 'Formato de mensaje inválido.' };
    }
    if (m.text.length > MAX_TEXT_LENGTH) {
      return { ok: false, error: `Cada mensaje admite hasta ${MAX_TEXT_LENGTH} caracteres.` };
    }
  }
  if (messages[messages.length - 1].role !== 'user') {
    return { ok: false, error: 'El último mensaje debe ser del usuario.' };
  }
  return { ok: true };
}

/** Hora corta para mostrar en cada mensaje. */
export function formatTime(date = new Date()) {
  return date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}
