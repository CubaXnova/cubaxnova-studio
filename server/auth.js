// Autenticación sencilla con contraseña única y cookie de sesión.
import crypto from 'node:crypto';
import { config } from './config.js';

const sessions = new Map(); // token -> expira (ms)
const attempts = new Map(); // ip -> { n, until }
const TTL = 1000 * 60 * 60 * 24 * 7;

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function isAuthed(req) {
  const token = parseCookies(req.headers.cookie).studio_session;
  const exp = token && sessions.get(token);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(token); return false; }
  return true;
}

export function login(req, res) {
  const ip = req.socket.remoteAddress || 'x';
  const a = attempts.get(ip) || { n: 0, until: 0 };
  if (a.until > Date.now()) return res.status(429).json({ error: 'Demasiados intentos. Espera un minuto.' });
  if (!config.password) return res.status(500).json({ error: 'Falta STUDIO_PASSWORD en .env' });
  if (!safeEqual(req.body?.password || '', config.password)) {
    a.n += 1;
    if (a.n >= 5) { a.n = 0; a.until = Date.now() + 60_000; }
    attempts.set(ip, a);
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  attempts.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + TTL);
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `studio_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL / 1000}${secure ? '; Secure' : ''}`);
  res.json({ ok: true });
}

export function logout(req, res) {
  const token = parseCookies(req.headers.cookie).studio_session;
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', 'studio_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
}

export function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'No autenticado' });
}
