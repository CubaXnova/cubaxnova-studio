// Puente con Claude Code (`claude -p --output-format stream-json`), el "segundo cerebro".
// Usa el Claude Code que ya esté instalado en el servidor (o CLAUDE_BIN), con el mismo HOME aislado que Codex.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config, ROOT } from './config.js';

export function claudeBin() {
  if (config.claudeBin) return config.claudeBin;
  const local = path.join(ROOT, 'node_modules', '.bin', 'claude');
  if (fs.existsSync(local)) return local;
  for (const dir of (process.env.PATH || '').split(':')) {
    const p = path.join(dir, 'claude');
    if (dir && fs.existsSync(p)) return p;
  }
  return null;
}

export function claudeEnv() {
  return { ...process.env, HOME: config.agentHome };
}

const short = (v, n = 3000) => (typeof v === 'string' ? v : Array.isArray(v) ? v.map((x) => x.text || '').join('\n') : JSON.stringify(v ?? '')).slice(-n);

function toItem(tu) {
  const i = tu.input || {};
  const base = { id: tu.id };
  switch (tu.name) {
    case 'Bash': return { ...base, kind: 'command_execution', command: i.command };
    case 'Edit': case 'MultiEdit': case 'Write': case 'NotebookEdit':
      return { ...base, kind: 'file_change', changes: [`${tu.name === 'Write' ? 'add' : 'update'} ${i.file_path || i.notebook_path || ''}`] };
    case 'Read': case 'Grep': case 'Glob': case 'LS':
      return { ...base, kind: 'read', text: `${tu.name} ${i.file_path || i.pattern || i.path || ''}` };
    case 'Task': case 'Agent': return { ...base, kind: 'subagent', text: i.description || i.subagent_type || 'subagente' };
    case 'TodoWrite': return { ...base, kind: 'todo_list', items: (i.todos || []).map((t) => `${t.status === 'completed' ? '✔' : '•'} ${t.content}`) };
    case 'WebSearch': case 'WebFetch': return { ...base, kind: 'web_search', text: i.query || i.url };
    default: return { ...base, kind: 'tool', text: tu.name };
  }
}

/** Ejecuta un turno con Claude Code. Devuelve { threadId, text, error, generated: [] }. */
export function runClaude({ prompt, threadId, onItem, signal, images = [] }) {
  const bin = claudeBin();
  if (!bin) {
    return Promise.resolve({ threadId, text: '', generated: [], error: 'No encuentro Claude Code en el servidor. Instálalo o pon su ruta en CLAUDE_BIN dentro de .env' });
  }
  if (images.length) prompt += `\n\n[Imágenes adjuntas: ábrelas con la herramienta Read para verlas: ${images.join(', ')}]`;
  const args = ['-p', '--output-format', 'stream-json', '--verbose',
    '--permission-mode', config.codexSandbox === 'danger-full-access' ? 'bypassPermissions' : 'acceptEdits'];
  if (config.claudeModel) args.push('--model', config.claudeModel);
  if (threadId) args.push('--resume', threadId);

  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd: config.workspaceDir, env: claudeEnv(), detached: true });
    let buf = ''; let stderr = ''; let sid = threadId || null; let text = ''; let error = null;
    const pending = new Map();
    const kill = () => { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ya terminó */ } };
    signal?.addEventListener('abort', kill, { once: true });

    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.session_id) sid = ev.session_id;
        if (ev.type === 'assistant') {
          for (const c of ev.message?.content || []) {
            if (c.type === 'text' && c.text?.trim()) text = c.text;
            if (c.type === 'tool_use') {
              const it = toItem(c);
              pending.set(c.id, it);
              onItem?.({ phase: 'started', ...it });
            }
          }
        } else if (ev.type === 'user') {
          for (const c of ev.message?.content || []) {
            if (c.type !== 'tool_result') continue;
            const it = pending.get(c.tool_use_id) || { id: c.tool_use_id, kind: 'tool' };
            onItem?.({ phase: 'completed', ...it, exitCode: it.kind === 'command_execution' ? (c.is_error ? 1 : 0) : undefined, output: short(c.content) });
          }
        } else if (ev.type === 'result') {
          if (ev.result) text = ev.result;
          if (ev.is_error) error = ev.result || ev.subtype || 'Claude terminó con error';
        }
      }
    });
    child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-4000); });
    child.on('error', (e) => resolve({ threadId: sid, text, generated: [], error: e.message }));
    child.on('close', (code) => {
      signal?.removeEventListener('abort', kill);
      if (signal?.aborted) error = 'Detenido';
      else if (code !== 0 && !error) error = stderr.trim().split('\n').slice(-3).join('\n') || `Claude terminó con código ${code}`;
      if (/not logged in|please run \/login|invalid api key|authentication/i.test(error || '')) {
        error = 'Claude Code no tiene sesión iniciada para Studio. En la terminal de Studio ejecuta: npm run claude-login';
      }
      resolve({ threadId: sid, text, generated: [], error });
    });
    child.stdin.end(prompt);
  });
}
