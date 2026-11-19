// CubaXnova Studio — servidor principal.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import express from 'express';
import { WebSocketServer } from 'ws';
import { config, ROOT } from './config.js';
import { login, logout, requireAuth, isAuthed } from './auth.js';
import * as lib from './library.js';
import { sendMessage, listChats, loadChat, deleteChat, codexEnv, addChatEntry, markUndone } from './codex.js';
import { claudeBin, claudeEnv } from './claude.js';
import * as snaps from './snapshots.js';
import { attachTerminal } from './terminal.js';
import crypto from 'node:crypto';
import * as notify from './notify.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use(express.static(path.join(ROOT, 'public')));
const vendor = (p) => express.static(path.join(ROOT, 'node_modules', p));
app.use('/vendor/xterm', vendor('@xterm/xterm'));
app.use('/vendor/xterm-fit', vendor('@xterm/addon-fit'));
app.use('/vendor/marked', vendor('marked'));
app.use('/vendor/dompurify', vendor('dompurify'));

app.post('/api/login', login);
app.post('/api/logout', logout);
app.get('/api/me', (req, res) => res.json({ authed: isAuthed(req) }));

const api = express.Router();
api.use(requireAuth);
const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req, res)); } catch (e) { res.status(400).json({ error: e.message }); }
};

api.get('/library', wrap(() => ({ agents: lib.listAgents(), skills: lib.listSkills() })));
api.post('/agents', wrap((req) => ({ id: lib.saveAgent(req.body) })));
api.post('/skills', wrap((req) => ({ id: lib.saveSkill(req.body) })));
for (const kind of ['agent', 'skill']) {
  api.post(`/${kind}s/:id/toggle`, wrap((req) => ({ enabled: lib.toggle(kind, req.params.id, req.body?.enabled) })));
  api.delete(`/${kind}s/:id`, wrap((req) => { lib.remove(kind, req.params.id); return { ok: true }; }));
}
api.post('/skills/import', wrap(async (req) => ({ imported: await lib.importSkills(req.body?.repo, req.body?.path) })));
api.post('/agents/import', wrap(async (req) => ({ imported: await lib.importAgents(req.body?.repo, req.body?.path) })));
api.get('/teams', wrap(() => lib.listTeams()));
api.post('/teams/:id/install', wrap((req) => lib.installTeam(req.params.id)));
api.get('/chats', wrap(() => listChats()));
api.get('/chats/:id', wrap((req) => loadChat(req.params.id) || { error: 'No existe' }));
api.delete('/chats/:id', wrap((req) => { deleteChat(req.params.id); return { ok: true }; }));
// Ver archivos del directorio de trabajo (imágenes, código...). Solo dentro del workspace.
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav' };
api.get('/files', (req, res) => {
  try {
    let p = decodeURIComponent(String(req.query.path || '')).replace(/^file:\/\//, '').split('#')[0];
    const base = fs.realpathSync(config.workspaceDir);
    const full = fs.realpathSync(path.resolve(base, p));
    if (full !== base && !full.startsWith(base + path.sep)) return res.status(403).json({ error: 'Solo se pueden ver archivos del directorio de trabajo' });
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      const entries = fs.readdirSync(full, { withFileTypes: true })
        .filter((e) => !e.name.startsWith('.'))
        .map((e) => {
          let size = 0; let mtime = 0;
          try { const s2 = fs.statSync(path.join(full, e.name)); size = s2.size; mtime = s2.mtimeMs; } catch { /* enlace roto */ }
          return { name: e.name, dir: e.isDirectory(), size, mtime };
        })
        .sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
      return res.json({ dir: path.relative(base, full), entries });
    }
    const ext = path.extname(full).slice(1).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || (st.size < 2_000_000 ? 'text/plain; charset=utf-8' : 'application/octet-stream'));
    // Los SVG pueden llevar scripts: se sirven sin permiso para ejecutar nada.
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self'");
    res.setHeader('Cache-Control', 'no-store');
    if (req.query.download) res.setHeader('Content-Disposition', `attachment; filename="${path.basename(full).replace(/[^\w.\-]/g, '_')}"`);
    fs.createReadStream(full).pipe(res);
  } catch {
    res.status(404).json({ error: 'No encontrado' });
  }
});

// Subir archivos desde el móvil/PC al workspace (carpeta subidas/). Máx. 25 MB por archivo.
api.post('/upload', express.raw({ type: () => true, limit: '25mb' }), wrap((req) => {
  const raw = decodeURIComponent(String(req.headers['x-filename'] || 'archivo'));
  const ext = path.extname(raw).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
  const base = path.basename(raw, path.extname(raw)).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'archivo';
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const name = `${stamp}-${crypto.randomBytes(2).toString('hex')}-${base}${ext}`;
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Error('Archivo vacío');
  const dir = path.join(config.workspaceDir, 'subidas');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), req.body);
  return { path: `subidas/${name}`, size: req.body.length };
}));

// Ajustes y avisos por Telegram
api.get('/settings', wrap(() => notify.publicSettings()));
api.post('/settings', wrap((req) => {
  const b = req.body || {};
  if (b.telegramToken) notify.setToken(b.telegramToken);
  if (b.notifyOn && ['all', 'errors', 'off'].includes(b.notifyOn)) notify.saveSettings({ notifyOn: b.notifyOn });
  if (b.clearTelegram) notify.saveSettings({ telegramToken: '', telegramChatId: '' });
  return notify.publicSettings();
}));
api.get('/push/key', wrap(() => ({ key: notify.pushPublicKey() })));
api.post('/push/subscribe', wrap((req) => ({ devices: notify.addPushSubscription(req.body) })));
api.post('/push/unsubscribe', wrap((req) => { notify.removePushSubscription(String(req.body?.endpoint || '')); return { ok: true }; }));
api.post('/push/test', wrap(async () => {
  const n = await notify.sendPush({ title: '👋 CubaXnova Studio', body: 'Los avisos en este móvil funcionan.' });
  if (!n) throw new Error('No hay ningún móvil suscrito o no se pudo enviar.');
  return { sent: n };
}));
api.post('/telegram/detect', wrap(() => notify.detectChat()));
api.post('/telegram/test', wrap(async () => { await notify.sendTelegram('👋 Hola desde CubaXnova Studio. Los avisos funcionan.'); return { ok: true }; }));

const cmdOut = (bin, args, env) => new Promise((resolve) => {
  if (!bin) return resolve(null);
  const p = spawn(bin, args, { env });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('error', () => resolve(null));
  p.on('close', () => resolve(out.trim()));
  setTimeout(() => { try { p.kill(); } catch { /* */ } }, 15000);
});
api.get('/status', wrap(async () => {
  const codexBinPath = config.codexBin || path.join(ROOT, 'node_modules', '.bin', 'codex');
  const [codex, claude] = await Promise.all([
    cmdOut(codexBinPath, ['login', 'status'], codexEnv()),
    cmdOut(claudeBin(), ['auth', 'status', '--json'], claudeEnv()),
  ]);
  let claudeOk = false;
  try { claudeOk = Boolean(JSON.parse(claude).loggedIn); } catch { /* sin json */ }
  return {
    codex: codex ?? 'no instalado',
    codexOk: /logged in/i.test(codex || ''),
    claude: claude === null ? 'no instalado' : claudeOk ? 'con sesión' : 'sin sesión',
    claudeOk,
    workspace: config.workspaceDir,
    sandbox: config.codexSandbox,
  };
}));

// Deshacer los cambios de la última tarea.
api.post('/undo', wrap(async (req) => {
  if (job) throw new Error('Hay una tarea en marcha. Espera a que termine para deshacer.');
  const { chatId, hash } = req.body || {};
  await snaps.undo(hash);
  if (chatId) markUndone(chatId, hash);
  return { ok: true };
}));
app.use('/api', api);

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  const origin = req.headers.origin;
  // Evita que otra web abra la terminal usando tu cookie.
  if (!isAuthed(req) || (origin && new URL(origin).host !== req.headers.host)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    if (url.pathname === '/ws/terminal') attachTerminal(ws, url.searchParams.get('id') || 'main');
    else if (url.pathname === '/ws/chat') handleChat(ws);
    else ws.close();
  });
});

// El trabajo de Codex vive en el servidor, NO en la conexión: si el móvil se bloquea o se corta el túnel,
// la tarea sigue y al volver se reengancha. Se ejecuta una tarea a la vez; las demás esperan en la COLA,
// que se guarda en disco y sobrevive a reinicios.
const chatClients = new Set();
let job = null; // { chatId, title, controller, live: [], lastText, error }
const QUEUE_FILE = path.join(config.dataDir, 'queue.json');
let queue = [];
try { queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); } catch { queue = []; }
const saveQueue = () => fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 1));
const queueView = () => queue.map((q) => ({ id: q.id, chatId: q.chatId || null, text: q.text.slice(0, 120) }));

function broadcast(ev) {
  if (job && !['chat', 'queue'].includes(ev.type)) ev.chatId = ev.chatId || job.chatId;
  // Guardamos lo que va pasando en el turno actual para enseñarlo a quien se conecte a mitad.
  if (job) {
    if (ev.type === 'message') job.live = [];
    else if (['turn', 'item', 'delegation'].includes(ev.type)) { job.live.push(ev); if (job.live.length > 300) job.live.shift(); }
  }
  const data = JSON.stringify(ev);
  for (const c of chatClients) if (c.readyState === 1) c.send(data);
}
const broadcastQueue = () => broadcast({ type: 'queue', items: queueView(), running: job ? { chatId: job.chatId, title: job.title } : null });

function enqueue(msg) {
  const files = Array.isArray(msg.files) ? msg.files.slice(0, 10).map(String) : [];
  const provider = msg.provider === 'claude' ? 'claude' : 'codex';
  queue.push({ id: crypto.randomUUID(), chatId: msg.chatId || null, text: String(msg.text).trim(), files, agent: msg.agent || null, provider, at: Date.now() });
  saveQueue();
  broadcastQueue();
  runNext();
}

function runNext() {
  if (job || !queue.length) return;
  const next = queue.shift();
  saveQueue();
  runJob(next);
}

async function runJob(msg) {
  job = { chatId: msg.chatId || null, title: msg.text.slice(0, 60), controller: new AbortController(), live: [], lastText: '', error: null };
  broadcastQueue();
  const emit = (ev) => {
    if (ev.type === 'chat') { job.chatId = ev.chatId; job.title = ev.title || job.title; }
    if (ev.type === 'message' && !ev.sub && ev.text) job.lastText = ev.text;
    if (ev.type === 'error') job.error = ev.text;
    broadcast(ev);
  };
  await snaps.before(msg.text);
  try {
    await sendMessage({ chatId: msg.chatId, text: msg.text, files: msg.files || [], agentId: msg.agent, provider: msg.provider, emit, signal: job.controller.signal });
  } catch (e) {
    emit({ type: 'error', text: e.message });
  } finally {
    const done = job;
    const snap = await snaps.after(msg.text);
    if (snap && done.chatId) {
      addChatEntry(done.chatId, { role: 'snapshot', hash: snap.hash, files: snap.files.slice(0, 200) });
      broadcast({ type: 'snapshot', chatId: done.chatId, hash: snap.hash, files: snap.files.slice(0, 200) });
    }
    job = null;
    broadcast({ type: 'idle', chatId: done.chatId });
    if (done.error !== 'Detenido') {
      notify.notifyTask({ title: done.title, ok: !done.error, text: done.error || done.lastText, queued: queue.length, chatId: done.chatId });
    }
    broadcastQueue();
    setTimeout(runNext, 1000);
  }
}

function handleChat(ws) {
  chatClients.add(ws);
  const send = (ev) => { if (ws.readyState === 1) ws.send(JSON.stringify(ev)); };
  send({ type: 'queue', items: queueView(), running: job ? { chatId: job.chatId, title: job.title } : null });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'stop') { job?.controller.abort(); return; }
    if (msg.type === 'unqueue') { queue = queue.filter((q) => q.id !== msg.id); saveQueue(); broadcastQueue(); return; }
    if (msg.type === 'attach') {
      // Al (re)conectar: si hay una tarea en marcha en este chat, se reenvía su estado.
      if (job && job.chatId && job.chatId === msg.chatId) {
        send({ type: 'running', chatId: job.chatId });
        for (const ev of job.live) send(ev);
      } else send({ type: 'idle', chatId: msg.chatId || null, quiet: true });
      return;
    }
    if (msg.type !== 'send') return;
    if (!String(msg.text || '').trim()) {
      if (!Array.isArray(msg.files) || !msg.files.length) return;
      msg.text = 'Mira los archivos adjuntos.';
    }
    if (job) {
      if (queue.length >= 50) return send({ type: 'error', chatId: msg.chatId, text: 'La cola está llena (50 tareas).' });
      send({ type: 'queued', chatId: msg.chatId || null, position: queue.length + 1 });
    }
    enqueue(msg);
  });
  ws.on('close', () => chatClients.delete(ws)); // cerrar la página ya NO cancela la tarea
}

// Si quedaron tareas en la cola (p. ej. tras actualizar Studio), se retoman solas.
setTimeout(runNext, 3000);

if (!config.password) console.warn('⚠  Define STUDIO_PASSWORD en .env antes de usarlo.');
server.listen(config.port, config.host, () => {
  console.log(`CubaXnova Studio en http://${config.host}:${config.port}`);
  console.log(`Directorio de trabajo: ${config.workspaceDir}`);
});
