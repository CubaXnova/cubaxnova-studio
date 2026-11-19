// Configuración central. Todo se puede cambiar con variables de entorno (.env).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Carga mínima de .env (sin dependencias).
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = process.env;
const DATA_DIR = path.resolve(ROOT, env.STUDIO_DATA_DIR || 'data');

export const config = {
  host: env.STUDIO_HOST || '127.0.0.1', // solo local por defecto: se entra por túnel SSH o proxy con HTTPS
  port: Number(env.STUDIO_PORT || 7860),
  password: env.STUDIO_PASSWORD || '',
  dataDir: DATA_DIR,
  libraryDir: path.join(ROOT, 'library'),
  workspaceDir: path.resolve(ROOT, env.STUDIO_WORKSPACE || 'workspace'),
  // HOME aislado para Codex: su login, config y skills viven aquí y no tocan nada más del VPS.
  agentHome: path.join(DATA_DIR, 'home'),
  codexBin: env.CODEX_BIN || '',
  claudeBin: env.CLAUDE_BIN || '',
  claudeModel: env.CLAUDE_MODEL || '',
  codexModel: env.CODEX_MODEL || '',
  codexSandbox: env.CODEX_SANDBOX || 'workspace-write', // read-only | workspace-write | danger-full-access
  maxDelegations: Number(env.STUDIO_MAX_DELEGATIONS || 3),
  shell: env.STUDIO_SHELL || env.SHELL || '/bin/bash',
};

for (const d of [config.dataDir, config.workspaceDir, config.agentHome, path.join(config.agentHome, '.codex'), path.join(config.dataDir, 'chats')]) {
  fs.mkdirSync(d, { recursive: true });
}
