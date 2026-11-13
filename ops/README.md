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

## Conexión de Power BI a la base (SL-133)

Power BI Service corre en la nube de Microsoft y lee `reporting` directo, por lo que **el puerto 5432 queda publicado** en la VPS (decisión que reemplaza la exportación a OneDrive del ADR de SL-150). Lo que lo protege:

- `ops/pg_hba.conf`: desde fuera solo entra `bi_reader`, a la base `slomp` y con TLS. Cualquier otro usuario (incluido `postgres`) o conexión sin TLS se rechaza. Docker publica puertos saltándose `ufw`, así que este archivo es el control real.
- TLS con el certificado de Let's Encrypt que ya emite Caddy para el dominio (`ops/pg-cert.sh`). Power BI debe conectarse al dominio, no a la IP, y con "Cifrar conexión" activo.
- `bi_reader` solo lee `reporting` (datos agregados, sin datos personales) y tiene límites.

Despliegue, en este orden y como `deploy` (la base se reinicia unos segundos):

1. `./ops/pg-cert.sh` (sin `pg-certs/` la base no arranca con `ssl=on`).
2. Habilitar el rol, una vez y a mano (la contraseña, por ejemplo de `openssl rand -hex 24`, no va al repositorio):

```
docker compose --env-file .env.prod -f docker-compose.prod.yml exec db psql -U postgres -d slomp -c "ALTER ROLE bi_reader LOGIN PASSWORD '<contraseña>' CONNECTION LIMIT 5" -c "ALTER ROLE bi_reader SET default_transaction_read_only = on" -c "ALTER ROLE bi_reader SET statement_timeout = '60s'"
```

3. `docker compose --env-file .env.prod -f docker-compose.prod.yml up -d db`
4. Cron semanal para seguir las renovaciones del certificado (la base lo recarga sin reiniciar):

```
0 9 * * 1 cd /home/deploy/slomp && ./ops/pg-cert.sh >> /home/deploy/backups/pg-cert.log 2>&1
```

Comprobación desde otro equipo: `psql "host=<dominio> user=bi_reader dbname=slomp sslmode=verify-full"` lee `reporting.settlement_summary`; `SELECT * FROM properties` falla con `42501`; con `sslmode=disable` o con el usuario `postgres` la conexión se rechaza.

Los respaldos quedan en la misma VPS: sirven ante un error, una migración
fallida o datos dañados, no ante la pérdida del servidor.
