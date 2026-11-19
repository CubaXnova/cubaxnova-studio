#!/usr/bin/env node
// Ejecuta Claude Code con el mismo HOME aislado que usa Studio (su propio login, separado del de root).
// Ejemplos:  npm run claude-login   |   npm run claude-status
import { spawn } from 'node:child_process';
import { config } from '../server/config.js';
import { claudeBin, claudeEnv } from '../server/claude.js';

const bin = claudeBin();
if (!bin) {
  console.error('No encuentro Claude Code. Si lo tienes instalado en otra ruta, ponla en .env: CLAUDE_BIN=/ruta/a/claude');
  process.exit(1);
}
const p = spawn(bin, process.argv.slice(2), { stdio: 'inherit', env: claudeEnv(), cwd: config.workspaceDir });
p.on('exit', (c) => process.exit(c ?? 0));
