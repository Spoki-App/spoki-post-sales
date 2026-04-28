import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_KsyDTEdz92Bw@ep-divine-paper-agf9wpl2-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require' });
const q = async (sql, p=[]) => (await pool.query(sql, p)).rows;
console.log('--- mystery client ---');
console.log(await q("SELECT id, hubspot_id, name, lifecycle_stage FROM clients WHERE id='fe0667ce-6519-4e4f-9203-44bb0c85d0a5'"));
console.log('--- all clients with name LIKE %DAV% or %Aqualia% or %43259% or %davsrl% ---');
console.log(await q("SELECT id, hubspot_id, name FROM clients WHERE name ILIKE '%dav%' OR name ILIKE '%aqualia%' OR name ILIKE '%43259%'"));
await pool.end();
