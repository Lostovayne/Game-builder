# Skills consolidation — ~/.agents/skills como única fuente

Objetivo: todos los skills viven solo en `~/.agents/skills`. Vaciar mirrors.
Decisión del usuario: opción 2 (vaciar todos los mirrors, incluyendo 480 symlinks válidos).

## Checklist (verificar cada paso antes de seguir)

- [x] Paso 0: backup lock + manifest + copia de 124 dirs reales de mirrors
- [x] Paso 1: mover `playwright-cli` (.claude→hub) y `aws-architecture-diagram` (.kiro→hub)
- [x] Paso 2: borrar 122 dirs reales duplicados/divergentes de mirrors (hub era lo más nuevo en 54/54)
- [x] Paso 3: borrar 72 symlinks rotos
- [x] Paso 4: borrar 480 symlinks válidos (mirrors quedan vacíos)
- [x] Paso 5: limpiar registries generados stale (`.atl/skill-registry.md` en roots vaciados)
- [x] Paso 6: lock — borrar 24 huérfanas (178→154)
- [x] Paso 7: actualizar 33 skills — upstream dice "all up to date", sin cambios
- [x] Paso 8: lock — auditoría estructural limpia, nada más que remover
- [x] Verificación final: hub 195 resolubles, mirrors 0, lock 0 huérfanas

## Decisión abierta

- `lastSelectedAgents` (12 agentes) se dejó intacto. El update del Paso 7 NO revivió links,
  así que no hay riesgo inminente. Recortar la lista cambia futuros installs.

## Decisiones registradas

- `_shared` del hub se conserva (11 archivos, sin SKILL.md a propósito: referencias, no invocable). Los 3 `_shared` de mirrors se borran, no se mueven.
- Mirrors se vacían pero las carpetas se conservan (algunos CLIs esperan que existan).
- Único lock: `~/.agents/.skill-lock.json`. No hay locks por mirror.

## Evidencia (commits no aplican — trabajo fuera de repo; backup en temp)

- Backup: `C:\Users\Deus\AppData\Local\Temp\opencode\skills-cleanup-backup\20260929\`
