# Instrucciones para agentes que trabajan en ESTE repositorio

Proyecto: **CubaXnova Studio**, espacio de trabajo web de código abierto para trabajar con IA
(chat con Codex, agentes/subagentes, skills y terminal del servidor).

## Estructura
- `server/` — Node.js (ESM, sin TypeScript). `index.js` rutas y WebSockets, `codex.js` puente con Codex y subagentes,
  `library.js` agentes/skills, `terminal.js` terminal (node-pty), `auth.js` login.
- `public/` — interfaz en HTML/CSS/JS sin framework ni paso de compilación.
- `library/agents/*.md` y `library/skills/<id>/SKILL.md` — agentes y skills que trae el proyecto.
- `scripts/` — instalación aislada en VPS y utilidades.

## Reglas
- Español en la interfaz, comentarios y documentación.
- Sin dependencias nuevas salvo que sean imprescindibles; nada de pasos de build en el frontend.
- Seguridad primero: toda ruta nueva de `/api` va detrás de `requireAuth`; valida ids con `ID_RE`;
  nunca pases texto del usuario a un shell (`spawn` con lista de argumentos, sin `shell: true`).
- El servidor escucha en 127.0.0.1 por defecto. No cambiar eso.
- Nunca subas `.env`, `data/` ni `workspace/`.
- Comprueba con `node --check server/*.js` y arrancando `npm run dev` antes de dar algo por terminado.
- Commits en formato Conventional Commits.
