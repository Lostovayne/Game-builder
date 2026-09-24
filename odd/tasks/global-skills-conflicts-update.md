# Feature: Global skills — quitar kubernetes-operator, acotar descriptions >1024, update global

Estado: COMPLETADO
Creado: 2026-09-24 · Cerrado: 2026-09-24
Alcance: `~/.agents/skills/` (fuente única), `~/.agents/.skill-lock.json`, links en `~/.pi/agent/skills` y `~/.claude/skills`

## Contexto

- El loader de skills reporta `[Skill conflicts] description exceeds 1024 characters` para 8 skills Infisical en `~/.agents/skills/`.
- Fuente única de la verdad: `~/.agents/skills/` (ver memoria obs 875 — duplicados de `.pi` ya eliminados).
- Lock global: `~/.agents/.skill-lock.json` (178 entries, 17 de `Infisical/ai-skills`).
- `npx skills update` completo se cuelga con ~178 skills → ejecutar por lotes por repo fuente (lección obs 872).
- Orden importante: el update puede restaurar contenido desde upstream; acotar descriptions recién después del update.

## Medición inicial (largo de description real, límite 1024)

| skill | largo | acción |
| --- | --- | --- |
| infisical-access-control | 1012 | ok |
| infisical-agent | 864 | ok |
| infisical-api | 380 | ok |
| infisical-app-connections | 1039 | acotar (-15) |
| infisical-dynamic-secrets | 987 | ok |
| infisical-gateway | 1073 | acotar (-49) |
| infisical-kms | 1057 | acotar (-33) |
| infisical-kubernetes-operator | 1126 | **eliminar skill** |
| infisical-pam | 1189 | acotar (-165) |
| infisical-pki | 1145 | acotar (-121) |
| infisical-secret-rotation | 1123 | acotar (-99) |
| infisical-secret-scanning | 1008 | ok |
| infisical-secret-syncs | 794 | ok |
| infisical-self-host | 532 | ok |
| infisical-sso | 981 | ok |
| infisical-terraform | 601 | ok (block scalar) |
| infisical-user-setup-guide | 1067 | acotar (-43) |

## Tareas

- [x] T1: Update global por lotes (`skills update -g -y <nombres>`) — 31 lotes = 31 sources, 0 timeouts, 0 errores/not-found, 44 skills actualizados. `update` NO acepta `owner/repo` como argumento: hay que pasar los nombres de skills del lock agrupados por `source`.
- [x] T2: Eliminar `infisical-kubernetes-operator` (`skills remove -g -y`) — lock 178→177, dir y links limpios.
- [x] T2b: **18 symlinks muertos retirados** del store (apuntaban a `~/Documents/dev/accounts-personal/.agents/skills/`, fuente borrada): claude-handoff, clerk, clerk-billing, clerk-chrome-extension-patterns, git-guardrails-claude-code, prisma-cli/client-api/compute/database-setup/driver-adapter-implementation/mongodb-upgrade/postgres/postgres-setup/upgrade-v7, scaffold-exercises, writing-beats/fragments/shape.
- [x] T3: Acotar las 7 descriptions sobre 1024 → 994 / 1010 / 1011 / 1007 / 1009 / 1012 / 962 (app-connections, gateway, kms, pam, pki, secret-rotation, user-setup-guide). Solo cambió la línea `description:`; bodies intactos (diff contra backup).
- [x] T3b: Sanear 8 referencias colgantes a `infisical-kubernetes-operator` (3 en descriptions + 5 filas de tablas "Not this skill" en agent, dynamic-secrets, secret-syncs, self-host, user-setup-guide) → texto plano "Infisical Kubernetes Operator docs".
- [x] T4: Verificación — 217 frontmatters con `yaml.safe_load`: **0 conflictos**, máx global 1012 (infisical-secret-rotation). Lock 177 con todos los dirs presentes, 0 links muertos en store y scopes, 0 menciones restantes al skill eliminado.

## Criterios de aceptación

- 0 conflictos `description exceeds 1024 characters`.
- `infisical-kubernetes-operator` ausente de lock, store y links.
- Ningún skill con body dañado; solo la línea `description:` modificada en los 7 acotados.
- Update global ejecutado por lotes sin cuelgues; deprecados retirados.

## Notas / decisiones

- Acotar description = editar la línea `description:` del frontmatter únicamente. No se toca el cuerpo del skill.
- Tras editar, el `skillFolderHash` del lock queda desalineado para esos 7 (esperado; solo afecta a futuros updates que podrían restaurar el upstream — re-acotar tras cada update de esa familia).
- `npx skills list -g` / `ls -g` cuelgan (interactivos) — no usar para verificación; validar con parser YAML sobre `~/.agents/skills/*/SKILL.md`.
- Escáner por regex da falso positivo con scalars plegados (`description: >`) si no corta en la siguiente clave del frontmatter: usar `yaml.safe_load`.
- Scope `codex` retirado del ecosistema de skills: quitado de `lastSelectedAgents` en el lock. `~/.codex` no existe y no debe recrearse.
- Backups de los 11 SKILL.md tocados: `/c/tmp/skills-backup/*.SKILL.md`; scripts: `/c/tmp/trim_skills.py`, `/c/tmp/trim_pki.py`; log del update: `/c/tmp/skills-update.log`.
