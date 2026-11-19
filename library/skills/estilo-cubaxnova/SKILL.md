---
name: estilo-cubaxnova
description: Guía de estilo visual de CubaXnova (juego de estrategia espacial). Úsala SIEMPRE que haya que crear o rehacer imágenes del juego (naves, defensas, edificios, investigaciones, planetas, recursos, iconos) para que todas parezcan del mismo juego. Trabaja junto con la skill imagegen.
license: MIT
---

# Estilo visual CubaXnova

## Imagen de referencia (la "nave madre" del estilo)
`arte/naves/nave-combate-ligera.png` (dentro del directorio de trabajo).
Pásala SIEMPRE como imagen de referencia a imagegen y pide "mismo estilo, misma paleta, misma luz".

## Reglas del estilo
- **Tipo**: ilustración sci-fi semirrealista, muy detallada, acabado limpio tipo videojuego (no foto, no cartoon, no pixel art).
- **Ángulo**: vista 3/4 desde arriba y de frente-derecha, objeto completo y centrado, ocupando ~80 % del lienzo.
- **Paleta**: gris metal (gunmetal) y paneles azul marino oscuro; acentos de luces **rojas**; brillos de motor/energía **azul cian**.
- **Luz**: clave suave desde arriba a la izquierda, reflejos metálicos discretos, sin sombras proyectadas en el suelo.
- **Fondo**: **transparente**. Sin escenario, sin estrellas, sin texto, sin marcas de agua, sin logotipos.
- **Formato**: PNG 512×512.
- **Familias** (mismo estilo, distinto objeto):
  - Naves y defensas: armamento visible, paneles con luces rojas.
  - Edificios (minas, fábricas, almacenes): estructuras sobre una pequeña plataforma flotante, mismos materiales y luces.
  - Investigaciones: objeto/tecnología simbólica (reactor, chip, escudo...) con brillo cian.
  - Planetas: esfera con atmósfera tenue, sin fondo.
  - Recursos (metal, cristal, deuterio, energía): icono-objeto simple, legible a 64×64.

## Prohibido
- Copiar o imitar el arte del OGame original ni de otros juegos o películas.
- Texto dentro de la imagen.

## Cómo trabajar con las imágenes del juego
Los originales están en `arte/originales/` (copia; NUNCA modificarlos). Muchas imágenes son el MISMO objeto en varios
tamaños (p. ej. `battleship_micro.jpg` 28×28 y `battleship_small.jpg` 40×40).

1. **Agrupa por objeto**: quita el sufijo de tamaño (`_micro`, `_small`, `_medium`, `_big`...) para saber cuántos objetos distintos hay.
2. **Una maestra por objeto**: genera UNA imagen 512×512 con imagegen y guárdala en `arte/maestras/<carpeta>/<objeto>.png`.
   El original solo sirve para saber QUÉ objeto es; el estilo viene de la imagen de referencia.
3. **Deriva los tamaños** a partir de la maestra (sin volver a usar imagegen), con Python + Pillow
   (si falta: `python3 -m pip install --user --break-system-packages pillow`) o ImageMagick si existe:
   - mismo **nombre**, **formato** (jpg/png) y **tamaño exacto** que cada original;
   - guarda en `arte/nuevas/<misma ruta que el original>`;
   - si el original es JPG (sin transparencia), rellena el fondo con el color de la esquina del original;
   - redimensiona con buen filtro (LANCZOS) y, para iconos ≤ 64 px, aumenta un poco el contraste para que se lea bien.
4. Trabaja por **tandas de 5 objetos** y anota cada uno en `arte/progreso.md` (objeto → maestra → archivos derivados → ✅/❌).
5. Al terminar la tanda, muestra en el chat las maestras con enlaces markdown y espera el visto bueno antes de seguir.
