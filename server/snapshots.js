// "Fotos" del directorio de trabajo con git, para poder DESHACER lo que hizo una tarea.
//   antes de la tarea: se guardan los cambios que hubiera (hechos a mano o desde la terminal)
//   después:           commit "Studio: <tarea>"  -> ese commit es el que se puede deshacer
// Solo se puede deshacer la ÚLTIMA tarea (si hubo cambios después, git podría mezclar cosas).
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.js';

const run = promisify(execFile);
const git = async (...args) => (await run('git', ['-C', config.workspaceDir, '-c', 'user.name=CubaXnova Studio',
  '-c', 'user.email=studio@localhost', '-c', 'core.quotepath=false', ...args], { maxBuffer: 20 << 20 })).stdout.trim();

async function ensureRepo() {
  if (!fs.existsSync(path.join(config.workspaceDir, '.git'))) await git('init', '-q');
}
const clean = (t) => String(t || '').replace(/\s+/g, ' ').slice(0, 72);

async function commitAll(message) {
  await git('add', '-A');
  const pending = await git('status', '--porcelain');
  if (!pending) return null;
  await git('commit', '-q', '--no-verify', '-m', message);
  return git('rev-parse', 'HEAD');
}

export async function before(title) {
  try { await ensureRepo(); await commitAll(`Cambios manuales (antes de: ${clean(title)})`); } catch (e) { console.warn('snapshot antes:', e.message); }
}

/** Devuelve { hash, files: [...] } o null si la tarea no cambió nada. */
export async function after(title) {
  try {
    const hash = await commitAll(`Studio: ${clean(title)}`);
    if (!hash) return null;
    const out = await git('show', '--name-status', '--format=', hash);
    const files = out.split('\n').filter(Boolean).map((l) => {
      const [st, ...rest] = l.split('\t');
      return { status: st[0], path: rest[rest.length - 1] };
    });
    return { hash, files };
  } catch (e) {
    console.warn('snapshot después:', e.message);
    return null;
  }
}

export async function undo(hash) {
  if (!/^[0-9a-f]{40}$/.test(hash || '')) throw new Error('Foto no válida');
  await ensureRepo();
  if (await git('status', '--porcelain')) throw new Error('Hay cambios nuevos en los archivos desde esa tarea (hechos a mano o en la terminal). Para no perderlos, no deshago automáticamente.');
  const head = await git('rev-parse', 'HEAD');
  if (head !== hash) throw new Error('Después de esta tarea hubo otras. Solo se puede deshacer la última.');
  await git('revert', '--no-edit', hash);
  return true;
}
