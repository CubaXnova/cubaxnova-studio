// Puente con Codex CLI (`codex exec --json`) + orquestación de subagentes.
//
// Cómo funcionan los subagentes:
//   1. El agente principal recibe sus instrucciones y la lista de subagentes activos.
//   2. Si quiere ayuda, escribe en su respuesta líneas del tipo:  @delegar <id>: <tarea>
//   3. El servidor ejecuta cada subagente (uno detrás de otro, en el mismo directorio de trabajo)
//      y le devuelve los resultados al principal, que los integra y contesta al usuario.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { config, ROOT } from './config.js';
import { listAgents, getAgent } from './library.js';

const CHATS_DIR = path.join(config.dataDir, 'chats');
const MAX_ROUNDS = 2;

function codexBin() {
  if (config.codexBin) return config.codexBin;
  const local = path.join(ROOT, 'node_modules', '.bin', 'codex');
  return fs.existsSync(local) ? local : 'codex';
}

export function codexEnv() {
  return { ...process.env, HOME: config.agentHome, CODEX_HOME: path.join(config.agentHome, '.codex') };
}

/** Ejecuta un turno de Codex. Devuelve { threadId, text, error }. */
export function runCodex({ prompt, threadId, onItem, signal, images = [] }) {
  // En el VPS la caja la pone systemd; ahí desactivamos del todo la de Codex (bwrap no funciona en Ubuntu reciente).
  const sandbox = config.codexSandbox === 'danger-full-access'
    ? ['--dangerously-bypass-approvals-and-sandbox']
    : ['-c', `sandbox_mode="${config.codexSandbox}"`];
  const common = ['--json', '--skip-git-repo-check', ...sandbox];
  if (config.codexModel) common.push('-m', config.codexModel);
  // Imágenes adjuntas: Codex las "ve". Se usa --image=RUTA para que cada flag tome exactamente un valor.
  for (const img of images) common.push(`--image=${img}`);
  const args = threadId
    ? ['exec', 'resume', ...common, threadId, '-']
    : ['exec', ...common, '-C', config.workspaceDir, '-'];

  return new Promise((resolve) => {
    const child = spawn(codexBin(), args, { cwd: config.workspaceDir, env: codexEnv(), detached: true });
    let buf = '';
    let stderr = '';
    let tid = threadId || null;
    let text = '';
    let error = null;
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
        if (ev.type === 'thread.started') tid = ev.thread_id;
        else if (ev.type === 'item.started' || ev.type === 'item.updated' || ev.type === 'item.completed') {
          const it = ev.item || {};
          if (ev.type === 'item.completed' && it.type === 'agent_message') text = it.text || text;
          onItem?.({ phase: ev.type.split('.')[1], ...simplify(it) });
        } else if (ev.type === 'turn.failed') error = ev.error?.message || 'El turno falló';
        else if (ev.type === 'error') error = ev.message || 'Error de Codex';
      }
    });
    child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-4000); });
    child.on('error', (e) => resolve({ threadId: tid, text, error: e.code === 'ENOENT' ? 'No encuentro Codex. Ejecuta: npm install' : e.message }));
    child.on('close', (code) => {
      signal?.removeEventListener('abort', kill);
      if (signal?.aborted) error = 'Detenido';
      else if (code !== 0 && !error) error = stderr.trim().split('\n').slice(-3).join('\n') || `Codex terminó con código ${code}`;
      resolve({ threadId: tid, text, error });
    });
    child.stdin.end(prompt);
  });
}

function simplify(it) {
  const out = { id: it.id, kind: it.type };
  if (it.type === 'agent_message' || it.type === 'reasoning') out.text = it.text || '';
  if (it.type === 'command_execution') {
    out.command = it.command;
    out.exitCode = it.exit_code;
    out.status = it.status;
    out.output = String(it.aggregated_output || '').slice(-3000);
  }
  if (it.type === 'file_change') out.changes = (it.changes || []).map((c) => `${c.kind} ${c.path}`);
  if (it.type === 'mcp_tool_call') out.text = `${it.server}/${it.tool}`;
  if (it.type === 'web_search') out.text = it.query;
  if (it.type === 'todo_list') out.items = (it.items || []).map((t) => `${t.completed ? '✔' : '•'} ${t.text}`);
  if (it.type === 'error') out.text = it.message;
  return out;
}

// ---------- Prompts ----------

function principalPrompt(agent, team) {
  const roster = team.length
    ? team.map((a) => `- ${a.id}: ${a.description}`).join('\n')
    : '(no hay subagentes activos)';
  return `# Tu papel: ${agent.name}
${agent.instructions}

# Equipo de subagentes disponible
${roster}

Para pedir ayuda a un subagente escribe, en una línea propia de tu respuesta:
@delegar <id>: <tarea concreta y autocontenida>
Puedes delegar a varios (máximo ${config.maxDelegations} por turno). Recibirás sus resultados y luego darás la respuesta final.
Si no hace falta delegar, responde directamente.`;
}

function subagentPrompt(agent, task) {
  return `# Tu papel: ${agent.name} (subagente)
${agent.instructions}

Trabajas en el directorio ${config.workspaceDir}, el mismo que el agente principal.
Haz SOLO la tarea encargada y termina con un resumen breve de lo que hiciste y de lo que encontraste.

# Tarea encargada
${task}`;
}

const DELEGATE_RE = /^\s*@delegar\s+([a-z0-9-]+)\s*:\s*(.+)$/gim;

// ---------- Chats ----------

export function listChats() {
  return fs.readdirSync(CHATS_DIR).filter((f) => f.endsWith('.json')).map((f) => {
    const c = JSON.parse(fs.readFileSync(path.join(CHATS_DIR, f), 'utf8'));
    return { id: c.id, title: c.title, updated: c.updated };
  }).sort((a, b) => b.updated - a.updated);
}
export function loadChat(id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const f = path.join(CHATS_DIR, `${id}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}
function saveChat(c) { c.updated = Date.now(); fs.writeFileSync(path.join(CHATS_DIR, `${c.id}.json`), JSON.stringify(c, null, 1)); }
export function deleteChat(id) { if (/^[a-f0-9-]{36}$/.test(id)) fs.rmSync(path.join(CHATS_DIR, `${id}.json`), { force: true }); }

/**
 * Procesa un mensaje del usuario. `emit` manda eventos a la interfaz en vivo.
 */
export async function sendMessage({ chatId, text, agentId, emit, signal, files = [] }) {
  let chat = chatId && loadChat(chatId);
  if (!chat) chat = { id: crypto.randomUUID(), title: text.slice(0, 60), threadId: null, agentId: null, messages: [] };
  emit({ type: 'chat', chatId: chat.id, title: chat.title });

  const agents = listAgents().filter((a) => a.enabled);
  const principal = agents.find((a) => a.id === agentId) || agents.find((a) => a.role === 'principal') || agents[0];
  if (!principal) { emit({ type: 'error', text: 'No hay agentes activos. Activa uno en el panel de Agentes.' }); return; }
  const team = agents.filter((a) => a.id !== principal.id && a.role !== 'principal');

  // Adjuntos (rutas relativas al workspace, ya validadas al subirlos).
  files = files.filter((f) => typeof f === 'string' && /^subidas\/[\w.-]+$/.test(f) && fs.existsSync(path.join(config.workspaceDir, f)));
  const images = files.filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f)).map((f) => path.join(config.workspaceDir, f));
  if (files.length) text += `\n\n[Archivos adjuntos en el directorio de trabajo: ${files.join(', ')}]`;
  chat.messages.push({ role: 'user', text: text.replace(/\n\n\[Archivos adjuntos[^\]]*\]$/, ''), files, at: Date.now() });
  saveChat(chat);

  // Si cambia el agente principal se empieza un hilo nuevo de Codex con sus instrucciones.
  let threadId = chat.agentId === principal.id ? chat.threadId : null;
  let prompt = threadId ? text : `${principalPrompt(principal, team)}\n\n# Mensaje del usuario\n${text}`;

  for (let round = 0; round <= MAX_ROUNDS; round++) {
    emit({ type: 'turn', agent: principal.id, name: principal.name });
    const r = await runCodex({ prompt, threadId, signal, images: round === 0 ? images : [], onItem: (item) => emit({ type: 'item', agent: principal.id, item }) });
    threadId = r.threadId;
    chat.threadId = threadId;
    chat.agentId = principal.id;
    if (r.error) {
      chat.messages.push({ role: 'error', text: r.error, at: Date.now() });
      saveChat(chat);
      emit({ type: 'error', text: r.error });
      return;
    }

    const delegations = [...r.text.matchAll(DELEGATE_RE)]
      .map((m) => ({ id: m[1].toLowerCase(), task: m[2].trim() }))
      .filter((d) => team.some((a) => a.id === d.id))
      .slice(0, config.maxDelegations);
    const visible = r.text.replace(DELEGATE_RE, '').trim();
    if (visible) chat.messages.push({ role: 'assistant', agent: principal.id, text: visible, at: Date.now() });
    emit({ type: 'message', agent: principal.id, name: principal.name, text: visible });

    if (!delegations.length || round === MAX_ROUNDS) break;

    const results = [];
    for (const d of delegations) {
      if (signal?.aborted) return;
      const sub = getAgent(d.id);
      chat.messages.push({ role: 'delegation', agent: d.id, text: d.task, at: Date.now() });
      emit({ type: 'delegation', from: principal.id, agent: d.id, name: sub.name, task: d.task });
      const sr = await runCodex({ prompt: subagentPrompt(sub, d.task), signal, onItem: (item) => emit({ type: 'item', agent: d.id, item }) });
      const out = sr.error ? `ERROR: ${sr.error}` : sr.text;
      chat.messages.push({ role: 'subagent', agent: d.id, text: out, at: Date.now() });
      emit({ type: 'message', agent: d.id, name: sub.name, sub: true, text: out });
      results.push(`## ${d.id}\n${out}`);
      saveChat(chat);
    }
    prompt = `Resultados de los subagentes:\n\n${results.join('\n\n')}\n\nIntegra estos resultados y responde al usuario. Delega otra vez solo si es imprescindible.`;
  }
  saveChat(chat);
  emit({ type: 'done', chatId: chat.id });
}
