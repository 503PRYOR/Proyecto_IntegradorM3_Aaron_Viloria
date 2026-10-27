import { formatTime } from './utils.js';

const GREETING =
  'Pase, pase. Veo que viene con prisa y con una pregunta. Hable, y sea breve: el tiempo es un recurso escaso.';

/** Llama a la función serverless y devuelve el texto de su respuesta JSON. */
export async function requestReply(messages, fetchFn = fetch, onToken = () => {}) {
  const request = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: messages.map(({ role, text }) => ({ role, text })) }),
  };
  const response = await fetchFn('/api/functions', request);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('El servidor devolvió una respuesta inválida.');
  }

  if (!response.ok) {
    throw new Error(data?.error || `Error del servidor (${response.status}).`);
  }

  if (typeof data?.reply !== 'string' || !data.reply.trim()) {
    throw new Error('El personaje no devolvió respuesta. Intenta de nuevo.');
  }
  onToken(data.reply, data.reply);
  return data.reply;
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
  let requestInFlight = false;

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
    if (requestInFlight) return;
    requestInFlight = true;
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
      requestInFlight = false;
    }
  }

  function sendMessage() {
    const text = input.value.trim();
    if (!text || requestInFlight) return;
    input.value = '';
    input.style.height = '';
    addMessage('user', text);
    askCharacter();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!input.value.trim() || requestInFlight) return;
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
    if (!requestInFlight) askCharacter();
  });

  addMessage('character', GREETING);
}