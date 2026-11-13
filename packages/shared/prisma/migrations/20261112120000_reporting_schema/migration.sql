-- Analytics module (SL-131): aggregated, personal-data-free view of the live
-- settlements for Power BI, read through the `bi_reader` role. No column of
-- this schema may identify a person or a property (checked by
-- reporting-schema.spec.ts). Not expressible in schema.prisma: hand-written.
CREATE SCHEMA "reporting";

-- One row per combination of the dimensions, over live settlements only
-- (replacedAt IS NULL). Capital excludes the "Interés ..." details: figures
-- are capital, without late-payment interest. "issuedAt" is stored as UTC
-- without a zone, hence the two conversions to get Bogotá's month.
CREATE MATERIALIZED VIEW "reporting"."settlement_summary" AS
SELECT
  m."slug" AS "municipality_slug",
  s."period" AS "period",
  date_trunc('month', r."issuedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')::date AS "generated_month",
  COALESCE(p."landUse"::text, 'SIN_DATO') AS "land_use",
  s."status"::text AS "status",
  (s."paymentOrderId" IS NOT NULL) AS "has_payment_order",
  count(*)::int AS "settlements_count",
  COALESCE(sum(c."capital"), 0)::numeric(16, 2) AS "capital_total"
FROM "settlements" s
JOIN "properties" p ON p."id" = s."propertyId"
JOIN "municipalities" m ON m."id" = p."municipalityId"
LEFT JOIN "resolutions" r ON r."id" = s."resolutionId"
LEFT JOIN LATERAL (
  SELECT sum(d."amount") AS "capital"
  FROM "settlement_details" d
  WHERE d."settlementId" = s."id"
    AND d."concept" IN ('Impuesto Predial', 'C.A.R.', 'Sobretasa Bomberil')
) c ON true
WHERE s."replacedAt" IS NULL
GROUP BY 1, 2, 3, 4, 5, 6;

-- REFRESH ... CONCURRENTLY needs a unique index over plain columns;
-- generated_month is NULL for settlements without a resolution.
CREATE UNIQUE INDEX "settlement_summary_dimensions" ON "reporting"."settlement_summary"
  ("municipality_slug", "period", "generated_month", "land_use", "status", "has_payment_order")
  NULLS NOT DISTINCT;

-- Date of the last refresh, shown on the dashboard. Always a single row.
CREATE TABLE "reporting"."last_refresh" (
  "id" boolean PRIMARY KEY DEFAULT true CHECK ("id"),
  "refreshed_at" timestamptz NOT NULL
);
INSERT INTO "reporting"."last_refresh" ("refreshed_at") VALUES (now());

-- Read-only role without login: the password is set by hand on the VPS
-- (never in the repository). Roles are per cluster, so it may already exist
-- (another database of the same server).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bi_reader') THEN
    CREATE ROLE "bi_reader" NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA "reporting" TO "bi_reader";
GRANT SELECT ON "reporting"."settlement_summary", "reporting"."last_refresh" TO "bi_reader";
-- No grant on any object of "public": the role cannot read the operational tables.
