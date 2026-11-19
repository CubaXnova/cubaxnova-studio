#!/usr/bin/env bash
# Quita CubaXnova Studio del VPS. Solo toca lo que instaló instalar-vps.sh.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Ejecuta con sudo."; exit 1; }

systemctl disable --now cubaxnova-studio 2>/dev/null || true
rm -f /etc/systemd/system/cubaxnova-studio.service
systemctl daemon-reload
echo "Servicio eliminado."

read -r -p "¿Borrar también /opt/cubaxnova-studio (chats, login de Codex, workspace) y el usuario 'studio'? [s/N] " r
if [[ "$r" =~ ^[sS]$ ]]; then
  rm -rf /opt/cubaxnova-studio
  userdel studio 2>/dev/null || true
  echo "Carpeta y usuario eliminados."
fi
