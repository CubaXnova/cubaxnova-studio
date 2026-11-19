// Librería de agentes y skills, guardados como archivos y activados/desactivados desde la interfaz.
//   agents/<id>.md            -> frontmatter (name, description, role) + instrucciones
//   skills/<id>/SKILL.md      -> formato abierto Agent Skills (agentskills.io), compatible con Codex
// Hay dos sitios:
//   library/          -> los que trae el proyecto (en git). Solo se pueden activar/desactivar.
//   data/library/     -> los tuyos: creados en la interfaz o importados de GitHub (fuera de git).
// Las skills activas se enlazan en el HOME aislado de Codex (<data>/home/.agents/skills), que es donde Codex las busca.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.js';

const run = promisify(execFile);
const AGENTS_DIR = path.join(config.libraryDir, 'agents');
const SKILLS_DIR = path.join(config.libraryDir, 'skills');
const USER_AGENTS_DIR = path.join(config.dataDir, 'library', 'agents');
const USER_SKILLS_DIR = path.join(config.dataDir, 'library', 'skills');
const STATE_FILE = path.join(config.dataDir, 'state.json');
// Codex lee ~/.agents/skills y Claude Code ~/.claude/skills (HOME aislado = data/home).
const ACTIVE_SKILLS_DIR = path.join(config.agentHome, '.agents', 'skills');
const CLAUDE_SKILLS_DIR = path.join(config.agentHome, '.claude', 'skills');
fs.mkdirSync(CLAUDE_SKILLS_DIR, { recursive: true });
for (const d of [AGENTS_DIR, SKILLS_DIR, USER_AGENTS_DIR, USER_SKILLS_DIR]) fs.mkdirSync(d, { recursive: true });

// Devuelve [{ id, file|dir, builtin }] juntando ambos sitios (los tuyos tienen prioridad).
function agentFiles() {
  const map = new Map();
  for (const [dir, builtin] of [[AGENTS_DIR, true], [USER_AGENTS_DIR, false]]) {
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.md')) map.set(f.slice(0, -3), { file: path.join(dir, f), builtin });
  }
  return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([id, v]) => ({ id, ...v }));
}
function skillDirs() {
  const map = new Map();
  for (const [dir, builtin] of [[SKILLS_DIR, true], [USER_SKILLS_DIR, false]]) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md'))) map.set(e.name, { dir: path.join(dir, e.name), builtin });
    }
  }
  return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([id, v]) => ({ id, ...v }));
}
fs.mkdirSync(ACTIVE_SKILLS_DIR, { recursive: true });

export const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);

export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { meta, body: m[2] };
}

const oneLine = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

let state = loadState();

export function listAgents() {
  return agentFiles().map(({ id, file, builtin }) => {
    const { meta, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    return {
      id, name: meta.name || id, description: meta.description || '', role: meta.role || 'subagente',
      instructions: body.trim(), builtin, enabled: state.agents.includes(id),
    };
  });
}

export function listSkills() {
  return skillDirs().map(({ id, dir, builtin }) => {
    const { meta } = parseFrontmatter(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'));
    const srcFile = path.join(dir, '.source');
    const source = fs.existsSync(srcFile) ? fs.readFileSync(srcFile, 'utf8').trim() : builtin ? 'proyecto' : 'propia';
    return { id, name: meta.name || id, description: meta.description || '', license: meta.license || '', source, builtin, enabled: state.skills.includes(id) };
  });
}

// Primera vez: se activan todos los agentes y skills que vienen con el proyecto.
if (!state) {
  state = { agents: [], skills: [] };
  state.agents = agentFiles().map((a) => a.id);
  state.skills = skillDirs().map((d) => d.id);
  saveState(state);
}

export function syncSkills() {
  // Quita enlaces gestionados por nosotros y vuelve a crear los de las skills activas (para Codex y para Claude).
  for (const target of [ACTIVE_SKILLS_DIR, CLAUDE_SKILLS_DIR]) {
    for (const name of fs.readdirSync(target)) {
      const p = path.join(target, name);
      if (fs.lstatSync(p).isSymbolicLink()) fs.unlinkSync(p);
    }
    for (const { id, dir } of skillDirs()) {
      if (state.skills.includes(id)) fs.symlinkSync(dir, path.join(target, id), 'dir');
    }
  }
}
syncSkills();

export function toggle(kind, id, enabled) {
  const list = kind === 'agent' ? state.agents : state.skills;
  const exists = (kind === 'agent' ? agentFiles() : skillDirs()).some((x) => x.id === id);
  if (!exists) throw new Error('No existe');
  const i = list.indexOf(id);
  const want = enabled ?? i < 0;
  if (want && i < 0) list.push(id);
  if (!want && i >= 0) list.splice(i, 1);
  saveState(state);
  if (kind === 'skill') syncSkills();
  return want;
}

export function saveAgent({ id, name, description, role, instructions }) {
  id = id || slug(name);
  if (!ID_RE.test(id)) throw new Error('Nombre no válido');
  const fm = `---\nname: ${oneLine(name || id)}\ndescription: ${oneLine(description)}\nrole: ${role === 'principal' ? 'principal' : 'subagente'}\n---\n\n`;
  fs.writeFileSync(path.join(USER_AGENTS_DIR, `${id}.md`), fm + String(instructions || '').trim() + '\n');
  if (!state.agents.includes(id)) { state.agents.push(id); saveState(state); }
  return id;
}

export function saveSkill({ id, name, description, body }) {
  id = id || slug(name);
  if (!ID_RE.test(id)) throw new Error('Nombre no válido');
  const dir = path.join(USER_SKILLS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${id}\ndescription: ${oneLine(description)}\n---\n\n${String(body || '').trim()}\n`);
  if (!state.skills.includes(id)) { state.skills.push(id); saveState(state); syncSkills(); }
  return id;
}

export function remove(kind, id) {
  if (!ID_RE.test(id)) throw new Error('Nombre no válido');
  const entry = (kind === 'agent' ? agentFiles() : skillDirs()).find((x) => x.id === id);
  if (!entry) throw new Error('No existe');
  if (entry.builtin) throw new Error('Los que vienen con el proyecto no se borran: desactívalos con el interruptor.');
  if (kind === 'agent') {
    fs.rmSync(entry.file, { force: true });
    state.agents = state.agents.filter((x) => x !== id);
  } else {
    fs.rmSync(entry.dir, { recursive: true, force: true });
    state.skills = state.skills.filter((x) => x !== id);
  }
  saveState(state);
  if (kind === 'skill') syncSkills();
}

// Importa skills de código abierto desde un repo público de GitHub (p. ej. anthropics/skills, openai/skills).
// Busca carpetas con SKILL.md y las copia DESACTIVADAS para que tú decidas cuáles encender.
export async function importSkills(repo, subdir = '') {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Usa el formato dueño/repo');
  if (subdir && !/^[\w./-]+$/.test(subdir)) throw new Error('Subcarpeta no válida');
  const tmp = fs.mkdtempSync(path.join(config.dataDir, 'import-'));
  try {
    await run('git', ['clone', '--depth', '1', `https://github.com/${repo}.git`, tmp], { timeout: 120_000 });
    const base = path.resolve(tmp, subdir || '.');
    if (!base.startsWith(tmp)) throw new Error('Ruta no válida');
    const found = [];
    const walk = (dir, depth) => {
      if (depth > 4) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!e.isDirectory() || e.name === '.git' || e.name === 'node_modules') continue;
        const p = path.join(dir, e.name);
        if (fs.existsSync(path.join(p, 'SKILL.md'))) found.push(p); else walk(p, depth + 1);
      }
    };
    walk(base, 0);
    const imported = [];
    for (const p of found) {
      const { meta } = parseFrontmatter(fs.readFileSync(path.join(p, 'SKILL.md'), 'utf8'));
      const id = slug(meta.name || path.basename(p));
      if (!ID_RE.test(id) || skillDirs().some((d) => d.id === id)) continue;
      const dest = path.join(USER_SKILLS_DIR, id);
      fs.cpSync(p, dest, { recursive: true, filter: (s) => !fs.lstatSync(s).isSymbolicLink() });
      fs.writeFileSync(path.join(dest, '.source'), `github.com/${repo}`);
      imported.push(id);
    }
    return imported;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export const getAgent = (id) => listAgents().find((a) => a.id === id);
