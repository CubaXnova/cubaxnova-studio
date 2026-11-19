#!/usr/bin/env bash
# Instalación AISLADA de CubaXnova Studio en un VPS que ya tiene otros proyectos.
# - Todo vive en /opt/cubaxnova-studio
# - Corre con su propio usuario "studio" (sin acceso a tus otros proyectos)
# - Usa su propio puerto (7860, solo en 127.0.0.1) y su propio servicio systemd
# - No toca nginx, bases de datos, ni otros servicios. No hace apt upgrade.
#
# Uso (como root o con sudo), DESPUÉS de clonar el repo en /opt/cubaxnova-studio:
#   sudo bash /opt/cubaxnova-studio/scripts/instalar-vps.sh
set -euo pipefail

DIR=/opt/cubaxnova-studio
USR=studio
PORT=${STUDIO_PORT:-7860}
NODE_VERSION=22.12.0

say() { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✘ %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Ejecuta con sudo."
[ -f "$DIR/package.json" ] || die "No encuentro $DIR/package.json. Primero: git clone https://github.com/CubaXnova/cubaxnova-studio.git $DIR"

say "1/6 Comprobando que el puerto $PORT está libre"
if ss -tln | awk '{print $4}' | grep -qE "[:.]$PORT\$"; then
  if systemctl is-active --quiet cubaxnova-studio; then echo "Ya lo usa CubaXnova Studio (reinstalación)."; else die "El puerto $PORT está ocupado por otro programa. Usa otro: STUDIO_PORT=7870 sudo -E bash $0"; fi
fi

say "2/6 Usuario propio '$USR'"
if ! id "$USR" >/dev/null 2>&1; then
  useradd --system --home-dir "$DIR" --shell /bin/bash "$USR"
fi

say "3/6 Node.js (>= 20)"
NODE_BIN=""
if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; then
  NODE_BIN="$(command -v node)"
  echo "Uso el Node del sistema: $($NODE_BIN -v) (no lo modifico)."
else
  echo "Node del sistema ausente o viejo: instalo Node $NODE_VERSION SOLO dentro de $DIR/.node (no afecta al resto)."
  ARCH=$(uname -m); case "$ARCH" in x86_64) A=x64;; aarch64) A=arm64;; *) die "Arquitectura $ARCH no soportada";; esac
  mkdir -p "$DIR/.node"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$A.tar.xz" | tar -xJ -C "$DIR/.node" --strip-components=1
  NODE_BIN="$DIR/.node/bin/node"
fi
NODE_DIR="$(dirname "$NODE_BIN")"

say "4/6 Dependencias del proyecto (incluye Codex CLI local, no global)"
mkdir -p "$DIR/data" "$DIR/workspace"
chown -R "$USR:$USR" "$DIR"
sudo -u "$USR" -H env PATH="$NODE_DIR:$PATH" bash -c "cd '$DIR' && npm ci --omit=dev --no-fund --no-audit"
if [ ! -d "$DIR/workspace/.git" ]; then
  sudo -u "$USR" -H env PATH="$NODE_DIR:$PATH" bash -c "cd '$DIR/workspace' && git init -q && git config user.name 'CubaXnova Studio' && git config user.email 'studio@localhost'" || true
fi

say "5/6 Configuración (.env)"
if [ ! -f "$DIR/.env" ]; then
  PASS=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)
  sed -e "s/^STUDIO_PASSWORD=.*/STUDIO_PASSWORD=$PASS/" -e "s/^STUDIO_PORT=.*/STUDIO_PORT=$PORT/" "$DIR/.env.example" > "$DIR/.env"
  chown "$USR:$USR" "$DIR/.env"; chmod 600 "$DIR/.env"
  echo "Contraseña generada para entrar en la web:  $PASS"
  echo "(queda guardada en $DIR/.env)"
else
  echo ".env ya existe, no lo toco."
fi

say "6/6 Servicio systemd propio (cubaxnova-studio)"
sed -e "s#^ExecStart=.*#ExecStart=$NODE_BIN server/index.js#" \
    -e "s#^Environment=NODE_ENV=production#Environment=NODE_ENV=production\nEnvironment=PATH=$NODE_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin#" \
    "$DIR/deploy/cubaxnova-studio.service" > /etc/systemd/system/cubaxnova-studio.service
systemctl daemon-reload
systemctl enable cubaxnova-studio
systemctl restart cubaxnova-studio
sleep 2
systemctl --no-pager --lines=5 status cubaxnova-studio || true

cat <<EOF

✅ Listo. Siguientes pasos:

1) Conecta Codex (una sola vez). Abre la URL que te muestre y pon el código:
   sudo -u $USR -H env PATH="$NODE_DIR:\$PATH" bash -c "cd $DIR && npm run codex-login"

2) Entra a la web desde tu PC/móvil con un túnel SSH (no abre puertos al exterior):
   ssh -L $PORT:127.0.0.1:$PORT TU_USUARIO@IP_DEL_VPS
   y abre  http://localhost:$PORT

   (Opcional) Dominio con HTTPS: mira deploy/nginx-ejemplo.conf

Para desinstalar sin dejar rastro:  sudo bash $DIR/scripts/desinstalar-vps.sh
EOF
