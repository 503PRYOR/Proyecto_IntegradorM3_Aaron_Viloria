import { formatTime } from './utils.js';

const GREETING =
  'Pase, pase. Veo que viene con prisa y con una pregunta. Hable, y sea breve: el tiempo es un recurso escaso.';
const SEND_DEBOUNCE_MS = 250;

export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Llama a la serverless function y lee la respuesta en streaming.
 * onToken(chunk, textoAcumulado) se invoca por cada fragmento.
 * Devuelve el texto completo. Lanza Error si no llegó nada utilizable.
 */
export async function requestReply(messages, fetchFn = fetch, onToken = () => {}) {
  const request = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: messages.map(({ role, text }) => ({ role, text })) }),
  };
  const response = await fetchFn('/api/functions', request);

  // Errores: el servidor los envía como JSON { error }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `Error del servidor (${response.status}).`);
  }

  // Respuesta en streaming (texto plano)
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        full += chunk;
        onToken(chunk, full);
      }
    } catch (error) {
      // Si se cortó a mitad pero ya había texto, conservamos lo recibido
      if (!full.trim()) throw error;
    }
    if (!full.trim()) throw new Error('El personaje no devolvió respuesta. Intenta de nuevo.');
    return full;
  }

  // Respaldo (por ejemplo, en pruebas): JSON { reply } o texto plano
  const raw = await response.text();
  try {
    const data = JSON.parse(raw);
    if (typeof data?.reply === 'string' && data.reply.trim()) {
      onToken(data.reply, data.reply);
      return data.reply;
    }
  } catch {
    /* no era JSON: se trata como texto */
  }
  if (!raw.trim()) throw new Error('El personaje no devolvió respuesta. Intenta de nuevo.');
  onToken(raw, raw);
  return raw;
}

export function initChat() {
  const list = document.getElementById('messages');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const typing = document.getElementById('typing');
  const errorBox = document.getElementById('chat-error');
  const errorText = document.getElementById('chat-error-text');
  const retryBtn = document.getElementById('retry-btn');

  // Historial en memoria: dura mientras no se recargue la página.
  const messages = [];
  let loading = false;

  function buildMessageElement(role, time) {
    const item = document.createElement('li');
    item.className = `msg msg--${role}`;

    const bubble = document.createElement('p');
    bubble.className = 'msg__text';

    const stamp = document.createElement('span');
    stamp.className = 'msg__time';
    stamp.textContent = `${role === 'user' ? 'Tú' : 'Nikola'} · ${time}`;

    item.append(bubble, stamp);
    list.append(item);
    return bubble;
  }

  function addMessage(role, text) {
    const message = { role, text, time: formatTime() };
    messages.push(message);
    const bubble = buildMessageElement(role, message.time);
    bubble.textContent = text; // textContent evita inyección de HTML
    scrollToBottom();
  }

  function scrollToBottom() {
    list.scrollTop = list.scrollHeight;
  }

  function setLoading(value) {
    loading = value;
    typing.hidden = !value;
    sendBtn.disabled = value;
    input.disabled = value;
    if (value) scrollToBottom();
    else input.focus();
  }

  function showError(message) {
    errorText.textContent = message;
    errorBox.hidden = false;
  }

  function hideError() {
    errorBox.hidden = true;
  }

  async function askCharacter() {
    hideError();
    setLoading(true);

    let bubble = null;
    let time = null;
    let partial = '';

    try {
      const reply = await requestReply(messages, fetch, (_chunk, full) => {
        partial = full;
        if (!bubble) {
          // Primer fragmento: ocultamos "escribiendo..." y creamos la burbuja
          typing.hidden = true;
          time = formatTime();
          bubble = buildMessageElement('character', time);
        }
        bubble.textContent = full;
        scrollToBottom();
      });
      messages.push({ role: 'character', text: reply, time: time ?? formatTime() });
      if (!bubble) addMessage('character', reply);
    } catch (error) {
      if (bubble && partial.trim()) {
        // Se cortó a mitad: conservamos lo que llegó, sin mostrar error
        messages.push({ role: 'character', text: partial, time });
      } else {
        showError(error.message || 'No se pudo conectar. Revisa tu conexión.');
      }
    } finally {
      setLoading(false);
    }
  }

  const sendMessage = debounce(() => {
    const text = input.value.trim();
    if (!text || loading) return;
    input.value = '';
    input.style.height = '';
    addMessage('user', text);
    askCharacter();
  }, SEND_DEBOUNCE_MS);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!input.value.trim() || loading) return;
    sendMessage();
  });

  // Enter envía; Shift+Enter hace salto de línea.
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  });

  retryBtn.addEventListener('click', () => {
    if (!loading) askCharacter();
  });

  addMessage('character', GREETING);
}