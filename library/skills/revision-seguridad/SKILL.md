---
name: revision-seguridad
description: Lista de comprobación para revisar seguridad en aplicaciones web y APIs (autenticación, inyecciones, secretos, permisos, dependencias). Úsala al revisar código o antes de publicar.
license: MIT
---

# Revisión de seguridad

Revisa y reporta (archivo:línea, riesgo, arreglo):

- **Secretos**: claves o tokens en el código o en git (`git grep -nE "(api[_-]?key|secret|token|password)\s*[:=]"`).
- **Autenticación y sesiones**: rutas sin proteger, cookies sin `HttpOnly`/`SameSite`, límites de intentos.
- **Entradas**: inyección SQL, de comandos (`exec` con texto del usuario), rutas (`../`), XSS (HTML sin sanear).
- **Permisos**: el servicio no debe correr como root si no hace falta; ficheros sensibles con `chmod 600`.
- **Red**: servicios internos escuchando en `0.0.0.0` sin necesidad; HTTPS delante de todo lo público.
- **Dependencias**: `npm audit` / `composer audit` y versiones abandonadas.
