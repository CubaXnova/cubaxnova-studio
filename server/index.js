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
import { sendMessage, listChats, loadChat, deleteChat, codexEnv } from './codex.js';
import { attachTerminal } from './terminal.js';

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
    if (st.isDirectory()) return res.json({ dir: path.relative(base, full), entries: fs.readdirSync(full, { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory() })) });
    const ext = path.extname(full).slice(1).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || (st.size < 2_000_000 ? 'text/plain; charset=utf-8' : 'application/octet-stream'));
    // Los SVG pueden llevar scripts: se sirven sin permiso para ejecutar nada.
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self'");
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(full).pipe(res);
  } catch {
    res.status(404).json({ error: 'No encontrado' });
  }
});

api.get('/status', wrap(() => new Promise((resolve) => {
  const bin = config.codexBin || path.join(ROOT, 'node_modules', '.bin', 'codex');
  const p = spawn(bin, ['login', 'status'], { env: codexEnv() });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('error', () => resolve({ codex: 'no instalado', workspace: config.workspaceDir, sandbox: config.codexSandbox }));
  p.on('close', () => resolve({ codex: out.trim() || 'desconocido', workspace: config.workspaceDir, sandbox: config.codexSandbox }));
})));
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

function handleChat(ws) {
  let controller = null;
  const emit = (ev) => { if (ws.readyState === 1) ws.send(JSON.stringify(ev)); };
  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'stop') { controller?.abort(); return; }
    if (msg.type !== 'send' || !String(msg.text || '').trim()) return;
    if (controller) return emit({ type: 'error', text: 'Espera a que termine la respuesta actual (o pulsa Detener).' });
    controller = new AbortController();
    try {
      await sendMessage({ chatId: msg.chatId, text: String(msg.text).trim(), agentId: msg.agent, emit, signal: controller.signal });
    } catch (e) {
      emit({ type: 'error', text: e.message });
    } finally {
      controller = null;
      emit({ type: 'idle' });
    }
  });
  ws.on('close', () => controller?.abort());
}

if (!config.password) console.warn('⚠  Define STUDIO_PASSWORD en .env antes de usarlo.');
server.listen(config.port, config.host, () => {
  console.log(`CubaXnova Studio en http://${config.host}:${config.port}`);
  console.log(`Directorio de trabajo: ${config.workspaceDir}`);
});
