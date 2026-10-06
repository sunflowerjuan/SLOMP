-- Property.landUse was free text copied from the "Destino" column. It becomes
-- the LandUse enum. Existing values are mapped ignoring case, surrounding
-- whitespace and accents (same rule as parseLandUse in the backend); anything
-- else cannot be represented and becomes NULL -- re-importing the tax roll
-- reports those rows as UNRECOGNIZED_LAND_USE warnings.
-- translate() is used instead of the unaccent extension so the migration does
-- not depend on an extension being allow-listed on the managed server.
CREATE TYPE "LandUse" AS ENUM ('RURAL', 'URBAN');

DO $$
DECLARE
  unmapped INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmapped
  FROM "properties"
  WHERE btrim(translate(lower("landUse"), 'áéíóúü', 'aeiouu')) NOT IN ('rural', 'urbano', '');
  IF unmapped > 0 THEN
    RAISE NOTICE 'LandUse migration: % property row(s) with an unrecognized landUse set to NULL', unmapped;
  END IF;
END $$;

ALTER TABLE "properties"
  ALTER COLUMN "landUse" TYPE "LandUse"
  USING (CASE btrim(translate(lower("landUse"), 'áéíóúü', 'aeiouu'))
    WHEN 'rural' THEN 'RURAL'
    WHEN 'urbano' THEN 'URBAN'
  END)::"LandUse";
