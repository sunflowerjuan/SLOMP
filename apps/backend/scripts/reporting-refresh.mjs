// Refreshes the aggregated `reporting` schema read by Power BI (SL-131):
//
//   pnpm --filter backend reporting:refresh
//
// On the VPS, cron runs it every night at 03:30 Bogotá (08:30 UTC):
//   30 8 * * * docker compose ... exec -T backend node scripts/reporting-refresh.mjs
// Needs DATABASE_URL (a role that owns the view, not bi_reader), from the
// environment or apps/backend/.env.
import 'dotenv/config';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  // CONCURRENTLY: the dashboard keeps reading the old data while it runs.
  await client.query(
    'REFRESH MATERIALIZED VIEW CONCURRENTLY reporting.settlement_summary',
  );
  await client.query('UPDATE reporting.last_refresh SET refreshed_at = now()');
  console.log('reporting.settlement_summary refreshed');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
