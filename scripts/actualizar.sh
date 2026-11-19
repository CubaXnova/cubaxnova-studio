#!/usr/bin/env bash
# Actualiza CubaXnova Studio: baja lo último de GitHub, instala dependencias y reinicia.
# Uso:  sudo bash /opt/cubaxnova-studio/scripts/actualizar.sh
set -euo pipefail
DIR=/opt/cubaxnova-studio
[ "$(id -u)" -eq 0 ] || { echo "Ejecuta con sudo."; exit 1; }
cd "$DIR"
# npm a veces reescribe package-lock.json: se descarta para que git pueda actualizar.
sudo -u studio git checkout -- package-lock.json 2>/dev/null || true
sudo -u studio git pull --ff-only
NODE_DIR="$(dirname "$(systemctl show -p ExecStart cubaxnova-studio | grep -o 'path=[^ ;]*' | cut -d= -f2)")"
sudo -u studio -H env PATH="$NODE_DIR:$PATH" bash -c "cd '$DIR' && npm ci --omit=dev --no-fund --no-audit"
systemctl restart cubaxnova-studio
sleep 2
systemctl is-active --quiet cubaxnova-studio && echo "✅ Studio actualizado y funcionando." || { echo "✘ No arrancó. Mira: journalctl -u cubaxnova-studio -n 30"; exit 1; }
