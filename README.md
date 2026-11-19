# CubaXnova Studio

Espacio de trabajo **de código abierto** para trabajar con inteligencia artificial de forma cómoda, con todo en un solo lugar:

| Panel | Qué hace |
|---|---|
| **Chat** | Hablas con un agente principal conectado a **Codex** (OpenAI). El agente lee, escribe código y ejecuta comandos en tu carpeta de trabajo. |
| **Agentes y Skills** | Activas, desactivas, creas o borras **agentes**, **subagentes** y **skills** con un interruptor. Puedes importar skills de código abierto desde GitHub. |
| **Terminal** | Terminal real de tu servidor (VPS) en el navegador. Sobrevive a desconexiones: ideal desde el móvil. |

| **Archivos** | Galería del directorio de trabajo: carpetas, miniaturas de imágenes, abrir y descargar. |

Además:
- **Cola de tareas**: si Codex está ocupado, lo que envíes queda en fila y se hace después (sobrevive a reinicios). Ideal para dejar trabajo de noche.
- **👥 Equipos de agentes** listos (Web, Laravel/PHP, App móvil) y **importador de agentes** de colecciones abiertas (VoltAgent, wshobson…), con buscador.
- **👀 Verificación visual**: la skill `verificar-web` saca capturas en móvil y PC (Playwright) para que la IA vea y corrija sus diseños. Navegador propio: `sudo bash scripts/instalar-navegador.sh`.
- **🧠 Dos cerebros**: Codex (OpenAI) o **Claude Code** (Anthropic), se cambia con un toque. Claude usa el Claude Code instalado en el servidor (`npm run claude-login` para darle sesión a Studio).
- **↶ Deshacer**: antes y después de cada tarea se guarda una "foto" del workspace con git; un botón deshace los cambios de la última tarea.
- **App en el móvil (PWA)**: se instala desde Chrome con *Añadir a pantalla de inicio*.
- **📎 Adjuntar imágenes y archivos** (o pegar una captura): las imágenes se le pasan a Codex para que las vea.
- **🎤 Dictar por voz** (si el navegador lo permite) y **🔊 escuchar** las respuestas: a mano, siempre (interruptor) o cuando escribes "léemelo".
- **🔔 Avisos de la app en el móvil** (Web Push) cuando termina o falla un trabajo, aunque la app esté cerrada.
- **Avisos por Telegram** al terminar o fallar cada tarea (se configura en *Chats → Avisos por Telegram*).
- Las tareas **siguen en el servidor** aunque cierres la página o se corte la conexión.

En el ordenador ves los paneles a la vez; en el móvil cambias entre ellos con la barra de abajo.

## Cómo funcionan los subagentes

1. El **agente principal** (por defecto *Orquestador*) recibe tu mensaje y la lista de subagentes activos.
2. Si necesita ayuda escribe `@delegar <id>: <tarea>` (por ejemplo `@delegar revisor: revisa server/auth.js`).
3. Studio ejecuta cada subagente con sus propias instrucciones, en la misma carpeta, y le devuelve los resultados al principal.
4. El principal integra todo y te responde. Ves en vivo cada delegación, cada comando y cada archivo modificado.

Agentes incluidos: **Orquestador** (principal), **Programador**, **Revisor**, **DevOps** y **Documentador**.

## Skills

Las skills usan el formato abierto **Agent Skills** (`SKILL.md`, ver [agentskills.io](https://agentskills.io)), el mismo que entienden Codex, Claude Code y otras herramientas. Las activas se enlazan en `data/home/.agents/skills`, que es donde Codex las busca.

Incluidas (MIT): `commit-convencional`, `servidor-seguro`, `revision-seguridad`, `plan-de-tarea` y `estilo-cubaxnova` (ejemplo de guía de estilo para generar arte de un juego).

Desde el panel **Skills → Importar** puedes traer más de:
- [`anthropics/skills`](https://github.com/anthropics/skills)
- [`openai/skills`](https://github.com/openai/skills) (carpeta `skills/.curated`)
- cualquier repo público `dueño/repo`

Llegan **desactivadas**; revisa la licencia de cada una antes de activarla.

## Instalación en un VPS (aislada, sin tocar tus otros proyectos)

```bash
sudo git clone https://github.com/CubaXnova/cubaxnova-studio.git /opt/cubaxnova-studio
sudo bash /opt/cubaxnova-studio/scripts/instalar-vps.sh
```

El instalador:
- crea un usuario propio `studio` (sin acceso a tus otros proyectos);
- usa su propio puerto (`7860`, solo en `127.0.0.1`) y comprueba que esté libre;
- instala las dependencias y **Codex CLI dentro del proyecto** (no global);
- si tu Node es viejo, descarga uno solo para el proyecto en `/opt/cubaxnova-studio/.node`;
- crea el servicio `cubaxnova-studio` con límites de memoria y CPU;
- **no** toca nginx, bases de datos ni otros servicios, y no hace `apt upgrade`.

Después:

```bash
# 1) Conectar Codex con tu cuenta de ChatGPT (una sola vez; el instalador te muestra el comando exacto)
sudo -u studio -H bash -c "cd /opt/cubaxnova-studio && npm run codex-login"
#    o con clave de API:
#    sudo -u studio -H bash -c "cd /opt/cubaxnova-studio && echo 'sk-...' | npm run codex -- login --with-api-key"

# 2) Desde tu PC o móvil, abrir un túnel SSH y entrar
ssh -L 7860:127.0.0.1:7860 usuario@IP_DEL_VPS
#    y abrir http://localhost:7860  (la contraseña está en /opt/cubaxnova-studio/.env)
```

¿Prefieres un dominio con HTTPS? Mira `deploy/nginx-ejemplo.conf` (es un archivo nuevo, no modifica los de tus otros sitios).

Actualizar: `sudo bash /opt/cubaxnova-studio/scripts/actualizar.sh` (baja lo último, instala dependencias y reinicia).

Desinstalar: `sudo bash /opt/cubaxnova-studio/scripts/desinstalar-vps.sh`

## Desarrollo local

```bash
npm install
cp .env.example .env   # pon una contraseña
npm run codex-login
npm run dev            # http://127.0.0.1:7860
```

## Configuración (`.env`)

| Variable | Por defecto | Para qué |
|---|---|---|
| `STUDIO_PASSWORD` | — | Contraseña de la web (obligatoria) |
| `STUDIO_HOST` / `STUDIO_PORT` | `127.0.0.1` / `7860` | Dónde escucha |
| `STUDIO_WORKSPACE` | `./workspace` | Carpeta donde trabajan los agentes |
| `CODEX_MODEL` | (el de Codex) | Modelo a usar |
| `CODEX_SANDBOX` | `workspace-write` | `read-only`, `workspace-write` o `danger-full-access` |
| `STUDIO_MAX_DELEGATIONS` | `3` | Subagentes como máximo por turno |

En el VPS se usa `CODEX_SANDBOX=danger-full-access` porque la caja propia de Codex (`bwrap`) no funciona en Ubuntu reciente sin tocar AppArmor. La protección la pone systemd: el servicio corre como `studio`, solo puede escribir en `/opt/cubaxnova-studio`, el resto del sistema es de solo lectura y `/home` y `/root` están ocultos.

## Seguridad

- Escucha solo en `127.0.0.1`.
- La IA y la terminal solo pueden escribir en `workspace/` y `data/`: no pueden modificar el código de Studio ni tus proyectos. No lo expongas a internet sin HTTPS.
- Login con contraseña, cookie `HttpOnly` + `SameSite=Strict`, límite de intentos y comprobación de origen en WebSockets.
- La terminal y Codex corren como el usuario `studio`: lo que hagan no alcanza a otros usuarios ni proyectos.
- El login de Codex, los chats y tus agentes/skills viven en `data/` (fuera de git).

## Estructura

```
server/      Node.js: rutas, Codex + subagentes, librería, terminal, login
public/      Interfaz (HTML/CSS/JS sin compilación)
library/     Agentes y skills que trae el proyecto
data/        Tus chats, login de Codex, agentes/skills propios e importados (no se sube a git)
scripts/     Instalar/desinstalar en VPS, utilidades de Codex
deploy/      Servicio systemd y ejemplo de nginx
```

## Licencia

MIT. Contribuciones bienvenidas.
