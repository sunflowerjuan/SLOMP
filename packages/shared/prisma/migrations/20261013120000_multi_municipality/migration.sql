-- Multi-municipality isolation: slug on municipalities, municipalityId on
-- owners / resolutions / resolution_counters / tax_roll_imports, and
-- per-municipality uniqueness. Existing data is backfilled to the municipality
-- it belongs to; the migration aborts, changing nothing, when that cannot be
-- done safely (see the RAISE EXCEPTION messages).

-- 1. Add the new columns as nullable so existing rows survive.
ALTER TABLE "municipalities" ADD COLUMN "slug" TEXT;
ALTER TABLE "owners" ADD COLUMN "municipalityId" INTEGER;
ALTER TABLE "resolutions" ADD COLUMN "municipalityId" INTEGER;
ALTER TABLE "resolution_counters" ADD COLUMN "municipalityId" INTEGER;
ALTER TABLE "tax_roll_imports" ADD COLUMN "municipalityId" INTEGER;

-- 2. Municipalities: required fields, and the DANE code must agree with the
--    cadastral codes already loaded (they start with the DANE code).
DO $$
DECLARE
  m RECORD;
  prefixes TEXT[];
  mismatched INTEGER;
BEGIN
  FOR m IN SELECT * FROM "municipalities" ORDER BY "id" LOOP
    IF m."state" IS NULL OR btrim(m."state") = '' THEN
      RAISE EXCEPTION 'Municipality % (%) has no state (departamento). Set it before migrating.', m."id", m."name";
    END IF;

    IF m."daneCode" IS NULL THEN
      SELECT array_agg(DISTINCT left("cadastralCode", 5)) INTO prefixes
        FROM "properties" WHERE "municipalityId" = m."id";
      IF prefixes IS NULL OR array_length(prefixes, 1) <> 1 THEN
        RAISE EXCEPTION 'Municipality % (%) has no DANE code and it cannot be inferred from its cadastral codes. Set "daneCode" before migrating.', m."id", m."name";
      END IF;
      UPDATE "municipalities" SET "daneCode" = prefixes[1] WHERE "id" = m."id";
      m."daneCode" := prefixes[1];
    END IF;

    IF m."daneCode" !~ '^[0-9]{5}$' THEN
      RAISE EXCEPTION 'Municipality % (%) has DANE code "%", which is not 5 digits.', m."id", m."name", m."daneCode";
    END IF;

    SELECT count(*) INTO mismatched FROM "properties"
      WHERE "municipalityId" = m."id" AND left("cadastralCode", 5) <> m."daneCode";
    IF mismatched > 0 THEN
      RAISE EXCEPTION 'Municipality % (%) has DANE code % but % of its properties have a cadastral code with another prefix. Fix "daneCode" (Paez, Boyaca is 15514) before migrating.', m."id", m."name", m."daneCode", mismatched;
    END IF;
  END LOOP;
END $$;

-- 3. Slug from the name (lowercase, no accents, hyphens). Repeated names get
--    the DANE code appended, e.g. paez-15514 and paez-19517.
UPDATE "municipalities"
SET "slug" = trim(both '-' from regexp_replace(
  lower(translate("name", 'ÁÀÄÂáàäâÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔóòöôÚÙÜÛúùüûÑñ', 'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuNn')),
  '[^a-z0-9]+', '-', 'g'));

UPDATE "municipalities" SET "slug" = "slug" || '-' || "daneCode"
WHERE "slug" IN (SELECT "slug" FROM "municipalities" GROUP BY "slug" HAVING count(*) > 1);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "municipalities" WHERE "slug" IS NULL OR "slug" = '') THEN
    RAISE EXCEPTION 'Could not derive a slug for every municipality. Set "slug" manually before migrating.';
  END IF;
END $$;

-- 4. Owners, resolutions, counters and imports take the municipality they
--    belong to.
DO $$
DECLARE
  municipality_count INTEGER;
  first_municipality INTEGER;
BEGIN
  SELECT count(*), min("id") INTO municipality_count, first_municipality FROM "municipalities";

  IF municipality_count = 0 AND (
    EXISTS (SELECT 1 FROM "owners") OR EXISTS (SELECT 1 FROM "tax_roll_imports")
  ) THEN
    RAISE EXCEPTION 'There are owners or tax roll imports but no municipality to assign them to.';
  END IF;

  -- An owner shared by properties of different municipalities would have to
  -- be split into one owner per municipality; not automated.
  IF EXISTS (
    SELECT 1 FROM "property_owners" po
    JOIN "properties" p ON p."id" = po."propertyId"
    GROUP BY po."ownerId" HAVING count(DISTINCT p."municipalityId") > 1
  ) THEN
    RAISE EXCEPTION 'An owner is linked to properties of more than one municipality. Split it per municipality before migrating.';
  END IF;

  UPDATE "owners" o SET "municipalityId" = (
    SELECT min(p."municipalityId") FROM "property_owners" po
    JOIN "properties" p ON p."id" = po."propertyId" WHERE po."ownerId" = o."id"
  );
  UPDATE "owners" SET "municipalityId" = first_municipality WHERE "municipalityId" IS NULL;

  UPDATE "resolutions" r SET "municipalityId" = p."municipalityId"
  FROM "properties" p WHERE p."id" = r."propertyId";

  -- Imports have no link to a property: only unambiguous with one municipality.
  IF municipality_count > 1 AND EXISTS (SELECT 1 FROM "tax_roll_imports") THEN
    RAISE EXCEPTION 'Cannot tell which municipality each tax roll import belongs to when there is more than one.';
  END IF;
  UPDATE "tax_roll_imports" SET "municipalityId" = first_municipality;

  -- Counters: with one municipality they carry over unchanged. With several,
  -- they are rebuilt from the highest sequence already issued to each.
  IF municipality_count = 1 THEN
    UPDATE "resolution_counters" SET "municipalityId" = first_municipality;
  ELSE
    DELETE FROM "resolution_counters";
    INSERT INTO "resolution_counters" ("municipalityId", "year", "lastSequence")
    SELECT "municipalityId", "year", max("sequence") FROM "resolutions" GROUP BY "municipalityId", "year";
  END IF;
END $$;

-- 5. Everything is filled: enforce it.
ALTER TABLE "municipalities" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "municipalities" ALTER COLUMN "state" SET NOT NULL;
ALTER TABLE "municipalities" ALTER COLUMN "daneCode" SET NOT NULL;
ALTER TABLE "owners" ALTER COLUMN "municipalityId" SET NOT NULL;
ALTER TABLE "resolutions" ALTER COLUMN "municipalityId" SET NOT NULL;
ALTER TABLE "resolution_counters" ALTER COLUMN "municipalityId" SET NOT NULL;
ALTER TABLE "tax_roll_imports" ALTER COLUMN "municipalityId" SET NOT NULL;

-- 6. Uniqueness per municipality.
ALTER TABLE "resolution_counters" DROP CONSTRAINT "resolution_counters_pkey",
ADD CONSTRAINT "resolution_counters_pkey" PRIMARY KEY ("municipalityId", "year");

DROP INDEX "owners_documentId_key";
DROP INDEX "resolutions_number_key";
DROP INDEX "resolutions_year_sequence_key";
DROP INDEX "tax_roll_imports_importedAt_idx";

CREATE UNIQUE INDEX "municipalities_slug_key" ON "municipalities"("slug");
CREATE UNIQUE INDEX "owners_municipalityId_documentId_key" ON "owners"("municipalityId", "documentId");
CREATE UNIQUE INDEX "resolutions_municipalityId_number_key" ON "resolutions"("municipalityId", "number");
CREATE UNIQUE INDEX "resolutions_municipalityId_year_sequence_key" ON "resolutions"("municipalityId", "year", "sequence");
CREATE INDEX "tax_roll_imports_municipalityId_importedAt_idx" ON "tax_roll_imports"("municipalityId", "importedAt");

-- 7. Foreign keys.
ALTER TABLE "owners" ADD CONSTRAINT "owners_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "resolution_counters" ADD CONSTRAINT "resolution_counters_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_roll_imports" ADD CONSTRAINT "tax_roll_imports_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
