import { describe, it, expect } from 'vitest';
import {
  resolveRoute,
  toGeminiContents,
  parseGeminiResponse,
  validateMessages,
} from '../src/utils.js';

describe('toGeminiContents', () => {
  it('convierte roles user/character a user/model', () => {
    const result = toGeminiContents([
      { role: 'user', text: 'Hola' },
      { role: 'character', text: 'Buenas tardes' },
    ]);
    expect(result).toEqual([
      { role: 'user', parts: [{ text: 'Hola' }] },
      { role: 'model', parts: [{ text: 'Buenas tardes' }] },
    ]);
  });

  it('descarta el saludo inicial del personaje', () => {
    const result = toGeminiContents([
      { role: 'character', text: 'Pase, pase.' },
      { role: 'user', text: 'Necesito ayuda' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
  });

  it('ignora mensajes vacíos', () => {
    expect(toGeminiContents([{ role: 'user', text: '   ' }])).toEqual([]);
  });
});

describe('parseGeminiResponse', () => {
  it('extrae el texto de la respuesta', () => {
    const data = { candidates: [{ content: { parts: [{ text: ' Elemental. ' }] } }] };
    expect(parseGeminiResponse(data)).toBe('Elemental.');
  });

  it('lanza error si la solicitud fue bloqueada', () => {
    expect(() => parseGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' } })).toThrow(
      /SAFETY/,
    );
  });

  it('lanza error si no hay texto', () => {
    expect(() => parseGeminiResponse({ candidates: [{ finishReason: 'MAX_TOKENS' }] })).toThrow(
      /MAX_TOKENS/,
    );
  });
});

describe('validateMessages', () => {
  it('acepta una conversación válida', () => {
    expect(validateMessages([{ role: 'user', text: 'Hola' }]).ok).toBe(true);
  });

  it('rechaza arreglos vacíos, roles inválidos y último mensaje del personaje', () => {
    expect(validateMessages([]).ok).toBe(false);
    expect(validateMessages([{ role: 'admin', text: 'x' }]).ok).toBe(false);
    expect(
      validateMessages([
        { role: 'user', text: 'a' },
        { role: 'character', text: 'b' },
      ]).ok,
    ).toBe(false);
  });
});

describe('resolveRoute', () => {
  it('resuelve rutas conocidas, "/" y barras finales', () => {
    expect(resolveRoute('/chat')).toBe('chat');
    expect(resolveRoute('/about/')).toBe('about');
    expect(resolveRoute('/')).toBe('home');
  });

  it('devuelve null para rutas desconocidas', () => {
    expect(resolveRoute('/inexistente')).toBeNull();
  });
});
