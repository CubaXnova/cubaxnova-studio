// Avisos por Telegram. La configuración se guarda en data/settings.json (fuera de git, permisos 600).
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import * as webpush from 'web-push';

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
    pushDevices: (s.pushSubs || []).length,
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

// ---------- Avisos de la app en el móvil (Web Push) ----------
// Las claves VAPID se crean una vez y se guardan en settings.json. Las suscripciones (una por móvil) también.
function vapid() {
  let s = getSettings();
  if (!s.vapidPublic || !s.vapidPrivate) {
    const k = webpush.generateVAPIDKeys();
    s = saveSettings({ vapidPublic: k.publicKey, vapidPrivate: k.privateKey });
  }
  webpush.setVapidDetails('mailto:studio@localhost', s.vapidPublic, s.vapidPrivate);
  return s.vapidPublic;
}
export const pushPublicKey = () => vapid();
// Envoltorio (permite simular el envío en pruebas).
export const pushTransport = { send: (sub, payload, opts) => webpush.sendNotification(sub, payload, opts) };

export function addPushSubscription(sub) {
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw new Error('Suscripción no válida');
  }
  const subs = (getSettings().pushSubs || []).filter((x) => x.endpoint !== sub.endpoint);
  subs.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, at: Date.now() });
  saveSettings({ pushSubs: subs.slice(-10) });
  return subs.length;
}
export function removePushSubscription(endpoint) {
  saveSettings({ pushSubs: (getSettings().pushSubs || []).filter((x) => x.endpoint !== endpoint) });
}

export async function sendPush({ title, body, url = '/' }) {
  const subs = getSettings().pushSubs || [];
  if (!subs.length) return 0;
  vapid();
  let sent = 0;
  for (const sub of subs) {
    try {
      await pushTransport.send(sub, JSON.stringify({ title, body: String(body || '').slice(0, 300), url }), { TTL: 3600 });
      sent += 1;
    } catch (e) {
      // 404/410 = ese móvil ya no existe o quitó el permiso: se borra.
      if (e.statusCode === 404 || e.statusCode === 410) removePushSubscription(sub.endpoint);
      else console.warn('Push:', e.statusCode || e.message);
    }
  }
  return sent;
}

/** Aviso automático al terminar una tarea (Telegram + app del móvil). Nunca rompe nada si falla. */
export async function notifyTask({ title, ok, text, queued, chatId }) {
  const s = getSettings();
  const mode = s.notifyOn || 'all';
  if (mode === 'off' || (mode === 'errors' && ok)) return;
  const plain = String(text || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '🖼').replace(/[#*`_>]/g, '').replace(/\s+/g, ' ').trim();
  sendPush({
    title: ok ? `✅ Terminó: ${title || 'tarea'}` : `❌ Falló: ${title || 'tarea'}`,
    body: `${plain.slice(0, 200)}${queued ? ` · Quedan ${queued} en cola` : ''}`,
    url: chatId ? `/?chat=${chatId}` : '/',
  }).catch(() => {});
  if (!s.telegramToken || !s.telegramChatId) return;
  const head = ok ? '✅ CubaXnova Studio terminó una tarea' : '❌ CubaXnova Studio: la tarea falló';
  const body = String(text || '').replace(/\s+\n/g, '\n').slice(0, 700);
  const tail = queued ? `\n\n⏭ Quedan ${queued} en la cola.` : '';
  try { await sendTelegram(`${head}\n«${title || 'Chat'}»\n\n${body}${tail}`); } catch (e) { console.warn('Telegram:', e.message); }
}
