#!/usr/bin/env bash
# Actualiza CubaXnova Studio: guarda cambios locales (por si acaso), baja lo último de GitHub,
# instala dependencias, refresca el servicio y reinicia.
# Uso:  sudo bash /opt/cubaxnova-studio/scripts/actualizar.sh
set -euo pipefail
DIR=/opt/cubaxnova-studio
[ "$(id -u)" -eq 0 ] || { echo "Ejecuta con sudo."; exit 1; }
cd "$DIR"
G() { sudo -u studio git -C "$DIR" "$@"; }

# npm a veces reescribe package-lock.json: se descarta.
G checkout -- package-lock.json 2>/dev/null || true
# Si alguien (o una IA) cambió el código de Studio en el servidor, se guarda una copia y se aparta.
if [ -n "$(G status --porcelain --untracked-files=no)" ]; then
  mkdir -p "$DIR/data/cambios-locales"
  F="$DIR/data/cambios-locales/$(date +%Y%m%d-%H%M%S).diff"
  G diff > "$F"; chown studio:studio "$F"
  G stash push -q -m "cambios locales $(date +%F_%T)"
  echo "⚠ Había cambios locales en el código de Studio. Copia guardada en: $F"
fi
G pull --ff-only

NODE_BIN="$(systemctl show -p ExecStart cubaxnova-studio | grep -o 'path=[^ ;]*' | cut -d= -f2)"
NODE_DIR="$(dirname "$NODE_BIN")"
sudo -u studio -H env PATH="$NODE_DIR:$PATH" bash -c "cd '$DIR' && npm ci --omit=dev --no-fund --no-audit"
# Refresca el servicio con la versión del repo (mismo Node que antes).
sed -e "s#^ExecStart=.*#ExecStart=$NODE_BIN server/index.js#" \
    -e "s#^Environment=NODE_ENV=production#Environment=NODE_ENV=production\nEnvironment=PATH=$NODE_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin#" \
    "$DIR/deploy/cubaxnova-studio.service" > /etc/systemd/system/cubaxnova-studio.service
mkdir -p "$DIR/data" "$DIR/workspace"; chown studio:studio "$DIR/data" "$DIR/workspace"
systemctl daemon-reload
systemctl restart cubaxnova-studio
sleep 2
systemctl is-active --quiet cubaxnova-studio && echo "✅ Studio actualizado y funcionando." || { echo "✘ No arrancó. Mira: journalctl -u cubaxnova-studio -n 30"; exit 1; }
