---
name: verificar-web
description: Mira de verdad una página web que estás creando o cambiando - saca capturas en móvil y en PC, detecta errores de consola, recursos rotos y desbordes de ancho, y corrige hasta que se vea bien. Úsala SIEMPRE al terminar cualquier cambio visual de HTML/CSS/JS antes de dar la tarea por hecha.
license: MIT
---

# Verificar una web visualmente

No des por terminado un diseño sin haberlo **visto**. Ciclo: **construir → capturar → mirar → corregir → repetir** (máx. 3 vueltas).

## 1. Capturar
```bash
node /opt/cubaxnova-studio/scripts/captura-web.mjs <archivo.html o http://127.0.0.1:PUERTO/> --out capturas/<nombre>
```
- Para un archivo suelto basta con su ruta. Si la web necesita servidor (rutas absolutas, fetch, frameworks),
  arráncalo solo en `127.0.0.1` y en un puerto libre (p. ej. `python3 -m http.server 8790 --bind 127.0.0.1` o `npm run dev -- --host 127.0.0.1`)
  y apágalo al terminar.
- El script devuelve un JSON con: capturas `movil.png` (390×844) y `pc.png` (1366×900), `errores` de consola,
  `peticionesFallidas` y `anchoDesbordado` (true = algo se sale por la derecha).
- Si dice que no hay navegador, avisa al usuario: `sudo bash /opt/cubaxnova-studio/scripts/instalar-navegador.sh`.

## 2. Mirar las capturas (obligatorio)
Abre las dos imágenes y revisa como un diseñador exigente:
- **Móvil primero**: nada se sale de ancho, textos legibles (≥16 px), botones tocables (≥44 px), sin solapes.
- Jerarquía clara (título → subtítulo → acción), espaciado coherente, contraste suficiente, imágenes que cargan.
- Cero errores de consola y cero recursos rotos.

## 3. Corregir y repetir
Arregla lo que veas, vuelve a capturar y compara. Para cuando todo esté bien o tras 3 vueltas (explica lo que quede).

## 4. Enseñárselo al usuario
Muestra las capturas finales con Markdown, p. ej. `![móvil](capturas/landing/movil.png)` y `![PC](capturas/landing/pc.png)`,
y resume en 2-3 líneas qué corregiste.
