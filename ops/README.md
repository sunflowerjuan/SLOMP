# ops/

Scripts para operar la VPS de producción. La guía completa (instalación del
cron, restauración paso a paso y monitoreo) está en Confluence: **Respaldos y
restauración**. Aquí no hay credenciales.

| Script | Qué hace |
| --- | --- |
| `backup.sh` | Cada noche (cron de `deploy`, 07:00 UTC = 02:00 Bogotá): `pg_dump` de la base y copia del volumen de Azurite en `~/backups` de la misma VPS. Guarda 7 diarios y 4 semanales (los del domingo). |
| `restore.sh` | Restaura un respaldo en el stack de producción de la máquina donde corre. Sobrescribe la base y el almacenamiento. |
| `check-log-rotation.sh` | Muestra la rotación de logs que Docker aplicó a cada contenedor (debe ser `json-file`, 10m, 5). |

## Refresco del esquema `reporting` (SL-131)

Cron de `deploy`, cada noche a las 03:30 Bogotá (08:30 UTC), junto a los respaldos:

```
30 8 * * * cd /home/deploy/slomp && docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T backend node scripts/reporting-refresh.mjs >> /home/deploy/backups/reporting.log 2>&1
```

El rol `bi_reader` se crea sin login con la migración. Para habilitarlo, una vez y a mano en la VPS (la contraseña no va al repositorio):

```
docker compose --env-file .env.prod -f docker-compose.prod.yml exec db psql -U postgres -d slomp -c "ALTER ROLE bi_reader LOGIN PASSWORD '<contraseña>'"
```

Los respaldos quedan en la misma VPS: sirven ante un error, una migración
fallida o datos dañados, no ante la pérdida del servidor.
