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
1. Originales en `arte/originales/` (copia; NUNCA modificar). Resultado en `arte/nuevas/` con la **misma ruta y el mismo nombre de archivo** que el original, para poder reemplazarlo luego.
2. Mira el original solo para saber **qué objeto** es (y su nombre de archivo); el **estilo** viene de la referencia.
3. Si el original no es 512×512, entrega también una copia redimensionada al tamaño original con el sufijo `@original` antes de la extensión... salvo que el usuario diga otra cosa.
4. Trabaja por **tandas de 5** imágenes y anota cada una en `arte/progreso.md` (original → nueva → ✅/❌ y motivo).
5. Al terminar cada tanda, muestra las nuevas en el chat con enlaces markdown y espera el visto bueno antes de seguir.
