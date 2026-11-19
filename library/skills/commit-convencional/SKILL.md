---
name: commit-convencional
description: Prepara commits de git con mensajes en formato Conventional Commits (feat, fix, docs...) a partir de los cambios preparados. Úsala cuando haya que hacer commit.
license: MIT
---

# Commit convencional

1. Mira los cambios: `git status` y `git diff --staged` (si no hay nada preparado, `git diff`).
2. Agrupa los cambios por intención. Si mezclan cosas distintas, propone varios commits.
3. Mensaje: `<tipo>(<ámbito opcional>): <resumen en imperativo, máx. 72 caracteres>`
   Tipos: feat, fix, docs, style, refactor, perf, test, build, ci, chore.
4. Cuerpo opcional: qué y por qué (no el cómo), en líneas de máx. 72 caracteres.
5. Nunca incluyas en el commit `.env`, claves, tokens ni carpetas `data/` o `node_modules/`.
6. No hagas `git push` salvo que el usuario lo pida.
