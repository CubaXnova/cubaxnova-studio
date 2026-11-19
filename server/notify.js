// Avisos por Telegram. La configuración se guarda en data/settings.json (fuera de git, permisos 600).
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const FILE = path.join(config.dataDir, 'settings.json');

export function getSettings() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
export function saveSettings(patch) {
  const s = { ...getSettings(), ...patch };
  fs.writeFileSync(FILE, JSON.stringify(s, null, 2), { mode: 0o600 });
  return s;
}
// Lo que ve la interfaz: el token nunca sale completo.
export function publicSettings() {
  const s = getSettings();
  return {
    telegramConfigured: Boolean(s.telegramToken && s.telegramChatId),
    telegramToken: s.telegramToken ? `${s.telegramToken.slice(0, 6)}…${s.telegramToken.slice(-4)}` : '',
    telegramChatId: s.telegramChatId || '',
    notifyOn: s.notifyOn || 'all', // all | errors | off
  };
}

const TOKEN_RE = /^\d{5,15}:[A-Za-z0-9_-]{20,80}$/;

async function tg(token, method, body) {
  if (!TOKEN_RE.test(token || '')) throw new Error('El token del bot no tiene el formato correcto');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.description || `Telegram respondió ${res.status}`);
  return data.result;
}

export function setToken(token) {
  token = String(token || '').trim();
  if (!TOKEN_RE.test(token)) throw new Error('El token del bot no tiene el formato correcto (números:letras)');
  saveSettings({ telegramToken: token });
}

/** Busca el último chat que le escribió al bot y lo guarda. */
export async function detectChat() {
  const { telegramToken } = getSettings();
  const updates = await tg(telegramToken, 'getUpdates', { limit: 20 });
  const last = [...updates].reverse().find((u) => u.message?.chat?.id);
  if (!last) throw new Error('No encuentro mensajes. Escríbele "hola" a tu bot en Telegram y vuelve a pulsar Detectar.');
  const chat = last.message.chat;
  saveSettings({ telegramChatId: String(chat.id) });
  return { chatId: String(chat.id), name: chat.first_name || chat.title || chat.username || '' };
}

export async function sendTelegram(text) {
  const { telegramToken, telegramChatId } = getSettings();
  if (!telegramToken || !telegramChatId) throw new Error('Telegram no está configurado');
  return tg(telegramToken, 'sendMessage', { chat_id: telegramChatId, text: text.slice(0, 4000), disable_web_page_preview: true });
}

/** Aviso automático al terminar una tarea. Nunca rompe nada si falla. */
export async function notifyTask({ title, ok, text, queued }) {
  const s = getSettings();
  if (!s.telegramToken || !s.telegramChatId) return;
  const mode = s.notifyOn || 'all';
  if (mode === 'off' || (mode === 'errors' && ok)) return;
  const head = ok ? '✅ CubaXnova Studio terminó una tarea' : '❌ CubaXnova Studio: la tarea falló';
  const body = String(text || '').replace(/\s+\n/g, '\n').slice(0, 700);
  const tail = queued ? `\n\n⏭ Quedan ${queued} en la cola.` : '';
  try { await sendTelegram(`${head}\n«${title || 'Chat'}»\n\n${body}${tail}`); } catch (e) { console.warn('Telegram:', e.message); }
}
