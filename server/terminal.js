// Terminal real del VPS en el navegador. La sesión sobrevive a desconexiones (útil en el móvil):
// al volver a entrar se reenvía lo último que salió en pantalla.
import path from 'node:path';
import pty from '@homebridge/node-pty-prebuilt-multiarch';
import { config, ROOT } from './config.js';

const MAX_BUFFER = 200_000;
const terms = new Map(); // id -> { proc, buffer, clients:Set }

function create(id) {
  const proc = pty.spawn(config.shell, ['-l'], {
    name: 'xterm-256color', cols: 100, rows: 30, cwd: config.workspaceDir,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      // `codex` en esta terminal usa el mismo login aislado que el chat.
      CODEX_HOME: path.join(config.agentHome, '.codex'),
      PATH: `${path.join(ROOT, 'node_modules', '.bin')}:${process.env.PATH}`,
    },
  });
  const t = { proc, buffer: '', clients: new Set() };
  proc.onData((d) => {
    t.buffer = (t.buffer + d).slice(-MAX_BUFFER);
    for (const ws of t.clients) if (ws.readyState === 1) ws.send(d);
  });
  proc.onExit(() => {
    for (const ws of t.clients) if (ws.readyState === 1) ws.send('\r\n[sesión terminada — recarga para abrir otra]\r\n');
    terms.delete(id);
  });
  terms.set(id, t);
  return t;
}

export function attachTerminal(ws, id = 'main') {
  if (!/^[a-z0-9-]{1,32}$/.test(id)) return ws.close();
  const t = terms.get(id) || create(id);
  t.clients.add(ws);
  if (t.buffer) ws.send(t.buffer);
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'input' && typeof msg.data === 'string') t.proc.write(msg.data);
    if (msg.type === 'resize') {
      const cols = Math.max(20, Math.min(400, msg.cols | 0));
      const rows = Math.max(5, Math.min(200, msg.rows | 0));
      try { t.proc.resize(cols, rows); } catch { /* ignorar */ }
    }
  });
  ws.on('close', () => t.clients.delete(ws));
}
