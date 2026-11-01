import { formatTime } from './utils.js';

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

    if (role === 'character') {
      const avatar = document.createElement('span');
      avatar.className = 'plasma-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.innerHTML = `
        <svg viewBox="0 0 160 160" focusable="false">
          <g class="plasma-rays plasma-rays--one">
            <path d="M80 80 75 69 70 61 72 51 65 43 63 31m7 30-9-3-7-8-10-2m18 3 9-10 2-10 8-8"/>
            <path d="M80 80 91 73 99 65 110 63 119 54 130 51m-20 12 2 10 8 6 3 12m-24-26 4-11-3-9 5-11"/>
            <path d="M80 80 72 91 64 98 62 109 53 116 48 129m14-20-10 1-7 8-11 2m30-22-10-2-8 4-11-3"/>
            <path d="M80 80 88 91 96 98 101 109 111 114 117 126m-16-17 10 1 7 7 12 1m-34-20 10-3 7 4 11-2"/>
          </g>
          <g class="plasma-rays plasma-rays--two">
            <path d="M80 80 79 66 84 57 81 47 87 39 85 28m-1 29 10-4 5-8 10-4"/>
            <path d="M80 80 67 78 57 72 47 74 38 68 27 67m20 7-5-9-9-4-4-10"/>
            <path d="M80 80 91 82 101 77 112 80 121 74 133 74m-21 6 5 9 10 4 4 10"/>
            <path d="M80 80 75 94 78 104 72 114 75 124 69 135m9-31-9 5-3 10-9 6"/>
          </g>
          <circle class="plasma-core-glow" cx="80" cy="80" r="20"/>
          <circle class="plasma-core" cx="80" cy="80" r="4"/>
          <circle cx="80" cy="80" r="1.5" fill="#fff"/>
        </svg>`;

      const content = document.createElement('div');
      content.className = 'msg__bubble';
      content.append(bubble, stamp);

      const copyButton = document.createElement('button');
      copyButton.className = 'msg__copy';
      copyButton.type = 'button';
      copyButton.textContent = 'Copiar';
      copyButton.setAttribute('aria-label', 'Copiar respuesta de Nikola');
      copyButton.addEventListener('click', async () => {
        copyButton.textContent = 'Copiando...';
        try {
          await navigator.clipboard.writeText(bubble.textContent);
          copyButton.textContent = 'Copiado';
        } catch {
          copyButton.textContent = 'No se pudo copiar';
        }
      });
      content.append(copyButton);
      item.append(avatar, content);
    } else {
      item.append(bubble, stamp);
    }

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
}