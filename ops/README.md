# ops/

Scripts para operar la VPS de producción. La guía completa (instalación del
cron, restauración paso a paso y monitoreo) está en Confluence: **Respaldos y
restauración**. Aquí no hay credenciales.

| Script | Qué hace |
| --- | --- |
| `backup.sh` | Cada noche (cron de `deploy`, 07:00 UTC = 02:00 Bogotá): `pg_dump` de la base y copia del volumen de Azurite en `~/backups` de la misma VPS. Guarda 7 diarios y 4 semanales (los del domingo). |
| `restore.sh` | Restaura un respaldo en el stack de producción de la máquina donde corre. Sobrescribe la base y el almacenamiento. |
| `check-log-rotation.sh` | Muestra la rotación de logs que Docker aplicó a cada contenedor (debe ser `json-file`, 10m, 5). |

Los respaldos quedan en la misma VPS: sirven ante un error, una migración
fallida o datos dañados, no ante la pérdida del servidor.
