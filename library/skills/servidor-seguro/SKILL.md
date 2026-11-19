---
name: servidor-seguro
description: Reglas para trabajar en un VPS con otros proyectos en producción sin afectarlos (consulta primero, copia de seguridad, cambio, comprobación, cómo deshacer). Úsala antes de tocar servicios, nginx, systemd, bases de datos o archivos fuera del directorio de trabajo.
license: MIT
---

# Trabajo seguro en el servidor

Sigue siempre este orden: **consulta → copia → cambio → comprobación → deshacer**.

1. **Consulta** sin cambiar nada: `systemctl status`, `journalctl -u <servicio> -n 50`, `ss -tlnp`, `df -h`, `nginx -t`.
2. **Copia de seguridad** de todo archivo que vayas a tocar: `cp archivo archivo.bak.$(date +%Y%m%d%H%M%S)`.
3. **Cambio mínimo**, solo de lo que pertenece a este proyecto. Nunca toques servicios, puertos, bases de datos
   ni carpetas de otros proyectos. Nada de `apt upgrade` general ni reinicios del servidor.
4. **Comprueba** que funciona (`nginx -t` antes de recargar, `curl` al servicio, logs).
5. **Deja escrito cómo deshacer** el cambio (comando exacto para restaurar la copia).

Si una acción puede afectar a otro proyecto o no se puede deshacer, para y pregunta al usuario.
