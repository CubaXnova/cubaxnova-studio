#!/usr/bin/env node
// Ejecuta Codex con el mismo HOME aislado que usa Studio (login, config y skills propios).
// Ejemplos:  npm run codex-login     |   npm run codex -- exec "hola"
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from '../server/config.js';
import { codexEnv } from '../server/codex.js';

const local = path.join(ROOT, 'node_modules', '.bin', 'codex');
const bin = config.codexBin || (fs.existsSync(local) ? local : 'codex');
const p = spawn(bin, process.argv.slice(2), { stdio: 'inherit', env: codexEnv(), cwd: config.workspaceDir });
p.on('exit', (c) => process.exit(c ?? 0));
