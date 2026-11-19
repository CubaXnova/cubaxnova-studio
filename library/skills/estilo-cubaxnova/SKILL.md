---
name: estilo-cubaxnova
description: Guía de estilo visual de CubaXnova (juego de estrategia espacial). Úsala SIEMPRE que haya que crear o rehacer imágenes del juego (naves, defensas, edificios, investigaciones, planetas, recursos, iconos) para que todas parezcan del mismo juego. Trabaja junto con la skill imagegen.
license: MIT
---

# Estilo visual CubaXnova

## Imagen de referencia (SOLO para el estilo, NUNCA para la forma)
`arte/naves/nave-combate-ligera.png` (dentro del directorio de trabajo) define **colores, materiales, luces y acabado**.
- Si se la pasas a imagegen, di SIEMPRE: "usa esta imagen solo para paleta, materiales e iluminación; la forma y la silueta
  deben ser COMPLETAMENTE distintas: <silueta de la tabla>".
- Si aun así sale parecida a la referencia u otra nave, vuelve a generar **sin** la imagen de referencia, describiendo el
  estilo solo con texto (sección "Reglas del estilo").

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

## Cada objeto, una silueta propia (OBLIGATORIO)
Antes de generar, escribe en el prompt la silueta del objeto. Ningún objeto puede parecerse a otro. Guía:

| Objeto (archivo) | Silueta y rasgos que lo distinguen |
|---|---|
| light_fighter | Caza pequeño y ágil, alas en flecha, 2 cañones, una cabina (es la nave de referencia) |
| heavy_fighter | Caza más grande y blindado, alas cortas y gruesas, 4 cañones, doble motor |
| cruiser | Nave mediana ancha y compacta, casco en cuña con torretas giratorias encima, sin alas de caza |
| battleship | Nave de guerra grande y alargada, casco tipo acorazado con varias filas de torretas pesadas |
| battlecruiser | Larga y estilizada, proa muy afilada, un gran cañón de energía central a lo largo del casco |
| bomber | Ancha y pesada, alas anchas tipo bombardero, bodega de bombas visible abajo, 4 motores |
| destroyer | Gigante tipo dreadnought, casco larguísimo y estrecho, muchas torretas, motores enormes |
| deathstar | Estación esférica colosal, del tamaño de una luna, con un plato-arma gigante |
| small_cargo | Transporte pequeño y cuadrado, cabina delante y un contenedor de carga detrás |
| large_cargo | Carguero grande con varios contenedores encadenados y grúas |
| colony_ship | Nave voluminosa con cúpulas de hábitat transparentes y módulos de colonos |
| recycler | Nave con brazos mecánicos y pinzas de recolección, tolva para escombros |
| espionage_probe | Sonda diminuta, cuerpo esférico con antenas y sensores, sin cabina |
| solar_satellite | Satélite con grandes paneles solares desplegados, sin motores grandes |
| crawler | Vehículo de superficie con orugas y taladros, no vuela |
| reaper | Nave agresiva con garras/cuchillas delanteras, perfil de depredador |
| pathfinder | Explorador alargado y ligero, con escáneres y antena larga |
| missiles / defensas | Torretas y lanzadores sobre plataforma fija (lanzacohetes, láser, gauss, iones, plasma); cúpulas de escudo semitransparentes |

Para objetos que no estén en la tabla, inventa una silueta basada en su función y anótala en `arte/progreso.md`.

## Comprobación antes de mostrar (OBLIGATORIO)
1. Cada maestra debe salir de una llamada NUEVA a imagegen (nunca copiar ni editar otra maestra).
2. Compara con todas las maestras existentes: si el hash (`sha256sum`) coincide o la silueta se parece, **regénerala**.
3. En el mensaje final, para cada maestra di en una línea qué la distingue de las demás.

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
   - **siempre PNG con fondo transparente** (aunque el original sea JPG), mismo nombre base y **tamaño exacto** que cada original:
     `battleship_small.jpg` → `battleship_small.png`;
   - guarda en `arte/nuevas/<misma ruta que el original>`;
   - si el original era JPG, apúntalo en `arte/cambios-de-extension.md` (ruta original → ruta nueva), porque luego
     habrá que cambiar esas referencias en el código del juego;
   - redimensiona con buen filtro (LANCZOS) y, para iconos ≤ 64 px, aumenta un poco el contraste para que se lea bien.
4. Trabaja por **tandas de 5 objetos** y anota cada uno en `arte/progreso.md` (objeto → maestra → archivos derivados → ✅/❌).
5. Al terminar la tanda, muestra en el chat las maestras con enlaces markdown y espera el visto bueno antes de seguir.

## Acabado de iconos pequeños
- Después de reducir a 64×64 o menos, aumenta el contraste y aplica una nitidez suave con unsharp mask.
- Añade alrededor de la silueta un contorno de 1 px oscuro y semitransparente para que destaque sobre fondos oscuros.
- Para naves largas y finas que pierdan legibilidad en `small` o `micro`, puede generarse con imagegen una vista compacta 3/4 más frontal, conservando identidad, estilo y colores. Úsala solo para esas variantes pequeñas; no reemplaza ni modifica la maestra.
- Encuadra el objeto para aprovechar el cuadrado disponible, conserva sus proporciones y mantén el fondo transparente.

## Lecciones aprendidas (evita estos errores)
- imagegen ya guarda cada imagen en `$CODEX_HOME/generated_images/`: **copia el PNG desde ahí**. NUNCA pases la imagen
  en Base64 dentro de un comando (falla con "Argument list too long").
- Antes de copiar o guardar, crea las carpetas: `mkdir -p arte/maestras/<carpeta> arte/nuevas/<carpeta>`.

