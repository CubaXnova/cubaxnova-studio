#!/usr/bin/env bash
# Instala un navegador SOLO para Studio (Chromium headless de Playwright, ~150 MB) dentro de
# /opt/cubaxnova-studio/data/navegadores. No toca el sistema. Si faltan librerías del sistema,
# te dice cuáles y el comando para instalarlas (no lo hace solo).
# Uso:  sudo bash /opt/cubaxnova-studio/scripts/instalar-navegador.sh
set -euo pipefail
DIR=/opt/cubaxnova-studio
[ "$(id -u)" -eq 0 ] || { echo "Ejecuta con sudo."; exit 1; }
FREE_MB=$(df -Pm / | awk 'NR==2{print $4}')
if [ "$FREE_MB" -lt 1500 ]; then echo "✘ Solo quedan ${FREE_MB} MB libres. Libera espacio antes (hace falta ~1,5 GB de margen)."; exit 1; fi

NODE_DIR="$(dirname "$(systemctl show -p ExecStart cubaxnova-studio | grep -o 'path=[^ ;]*' | cut -d= -f2)")"
echo "▶ Descargando Chromium para Studio (puede tardar)…"
sudo -u studio -H env PATH="$NODE_DIR:$PATH" PLAYWRIGHT_BROWSERS_PATH="$DIR/data/navegadores" \
  bash -c "cd '$DIR' && npx playwright-core install --only-shell chromium"

BIN=$(find "$DIR/data/navegadores" -type f -name 'chrome-headless-shell' | head -1)
[ -n "$BIN" ] || { echo "✘ No se descargó el navegador."; exit 1; }
MISSING=$(ldd "$BIN" 2>/dev/null | awk '/not found/{print $1}' | sort -u | tr '\n' ' ')
if [ -n "$MISSING" ]; then
  echo
  echo "⚠ Faltan estas librerías del sistema: $MISSING"
  echo "  Son librerías normales (no cambian nada de tus proyectos). Para instalarlas:"
  echo "  sudo -u studio -H env PATH=\"$NODE_DIR:\$PATH\" bash -c \"cd $DIR && npx playwright-core install-deps --dry-run chromium\""
  echo "  (ese comando te muestra el 'apt-get install …' exacto; revísalo y ejecútalo tú si estás de acuerdo)"
  exit 2
fi
du -sh "$DIR/data/navegadores" | awk '{print "✅ Navegador listo ("$1"). La skill verificar-web ya puede sacar capturas."}'
