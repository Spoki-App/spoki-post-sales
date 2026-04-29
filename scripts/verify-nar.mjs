import pg from 'pg';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const tables = await client.query(`
  SELECT table_name,
         (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public') AS col_count
  FROM information_schema.tables t
  WHERE table_schema = 'public' AND table_name LIKE 'nar_%'
  ORDER BY table_name
`);
console.log('NAR tables:');
console.table(tables.rows);

const propCount = await client.query(`
  SELECT count(*) FILTER (WHERE raw_properties ? 'spoki_company_id_unique') AS with_spoki_id,
         count(*) AS total_clients
  FROM clients
`);
console.log('clients.raw_properties spoki_company_id_unique coverage:');
console.table(propCount.rows);

const ownerCoverage = await client.query(`
  SELECT
    count(*) FILTER (WHERE raw_properties ? 'spoki_company_id_unique' AND cs_owner_id IS NOT NULL) AS resolvable,
    count(*) FILTER (WHERE raw_properties ? 'spoki_company_id_unique' AND cs_owner_id IS NULL) AS no_owner
  FROM clients
`);
console.log('Operator resolution potential (need both spoki_id + cs_owner_id):');
console.table(ownerCoverage.rows);

const sample = await client.query(`
  SELECT
    name,
    (raw_properties->>'spoki_company_id_unique')::bigint AS spoki_account_id,
    cs_owner_id
  FROM clients
  WHERE raw_properties ? 'spoki_company_id_unique'
    AND raw_properties->>'spoki_company_id_unique' ~ '^[0-9]+$'
  LIMIT 5
`);
console.log('Sample resolvable clients:');
console.table(sample.rows);

await client.end();
