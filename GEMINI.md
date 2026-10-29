# Directrices de Desarrollo y Flujo Git — SGD Unitrópico

## Protocolo Obligatorio de Sincronización con GitHub

Para mantener el repositorio permanentemente sincronizado con el remoto en GitHub y evitar conflictos de versiones o inconsistencias en los despliegues de Vercel, el asistente debe seguir estrictamente este flujo de trabajo:

1. **Sincronización Previa (Pull Obligatorio):**
   * Antes de iniciar cualquier tarea o modificación de archivos, ejecuta:
     ```powershell
     git pull origin main
     ```
   * Ejecuta siempre este comando con `BypassSandbox: true` para permitir la conexión de red a `github.com`.
   * Si existen cambios remotos, intégralos antes de continuar.

2. **Verificación Pre-Commit:**
   * Antes de registrar un cambio, valida que no se rompa la compilación ni el tipado TypeScript:
     ```powershell
     npm run build
     npm run typecheck
     ```

3. **Publicación Continua (Commit & Push):**
   * Una vez completado el bloque de cambios solicitado por el usuario, regístralo de inmediato:
     ```powershell
     git add -A
     git commit -m "feat/fix: descripción clara del cambio realizado"
     git push origin main
     ```
   * Ejecuta `git push` siempre con `BypassSandbox: true`.

4. **Despliegues Automáticos:**
   * Cada `git push origin main` dispara el despliegue en producción en Vercel. Verifica el estado del despliegue cuando el usuario solicite comprobar la disponibilidad en vivo.

