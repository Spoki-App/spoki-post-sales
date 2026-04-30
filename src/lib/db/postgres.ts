import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import { config } from '@/lib/config';
import { getLogger } from '@/lib/logger';

const logger = getLogger('db:postgres');

let pool: Pool | null = null;
let poolCreatedAt: Date | null = null;

const POOL_MAX_AGE_MS = 5 * 60 * 1000;
const STATEMENT_TIMEOUT_MS = 30000;
const QUERY_RETRY_LIMIT = 1;
const RETRY_BACKOFF_MS = 250;

const CONNECTION_ERROR_PATTERNS = [
  'Connection terminated unexpectedly',
  'Connection terminated',
  'Client has encountered a connection error',
  'terminating connection due to idle',
  'server closed the connection unexpectedly',
  'ECONNRESET',
  'EPIPE',
];

function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return CONNECTION_ERROR_PATTERNS.some(p => error.message.includes(p));
}

function shouldRecyclePool(): boolean {
  if (!pool || !poolCreatedAt) return false;
  return Date.now() - poolCreatedAt.getTime() > POOL_MAX_AGE_MS;
}

function resetPool(): void {
  if (pool) {
    pool.end().catch(err => logger.error('Error closing PostgreSQL pool', { error: String(err) }));
  }
  pool = null;
  poolCreatedAt = null;
}

function getServiceAccountCredentials(): Record<string, string> | null {
  const saBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (saBase64) {
    try {
      return JSON.parse(Buffer.from(saBase64, 'base64').toString('utf-8'));
    } catch {
      logger.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_BASE64');
    }
  }
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return { type: 'service_account', project_id: projectId, client_email: clientEmail, private_key: privateKey.replace(/\\n/g, '\n') };
  }
  return null;
}

async function buildCloudSqlPoolConfig(): Promise<PoolConfig | null> {
  const instanceConnectionName = config.postgres.instanceConnectionName;
  if (!instanceConnectionName) return null;

  try {
    const { Connector, IpAddressTypes } = await import('@google-cloud/cloud-sql-connector');
    const { GoogleAuth } = await import('google-auth-library');

    const credentials = getServiceAccountCredentials();
    if (!credentials) {
      logger.warn('CLOUD_SQL_INSTANCE_CONNECTION_NAME set but no service account found — falling back to direct TCP');
      return null;
    }

    const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const connector = new Connector({ auth });
    const clientOpts = await connector.getOptions({ instanceConnectionName, ipType: IpAddressTypes.PUBLIC });

    return {
      ...clientOpts,
      user: config.postgres.user,
      password: config.postgres.password,
      database: config.postgres.database,
      max: 5, min: 0,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 15000,
      allowExitOnIdle: true,
      statement_timeout: STATEMENT_TIMEOUT_MS,
    };
  } catch (err) {
    logger.error('Cloud SQL Connector setup failed, falling back to direct TCP', { error: String(err) });
    return null;
  }
}

function buildDirectPoolConfig(): PoolConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      max: 5, min: 0,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: true,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      ssl: { rejectUnauthorized: false },
    };
  }
  return {
    host: config.postgres.host,
    port: config.postgres.port,
    database: config.postgres.database,
    user: config.postgres.user,
    password: config.postgres.password,
    max: 5, min: 0,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    ssl: config.postgres.ssl ? { rejectUnauthorized: false } : false,
  };
}

async function getPool(): Promise<Pool> {
  if (shouldRecyclePool()) {
    logger.info('Recycling PostgreSQL pool');
    resetPool();
  }
  if (pool) return pool;

  if (!process.env.DATABASE_URL && !config.postgres.host && !config.postgres.instanceConnectionName) {
    throw new Error('PostgreSQL not configured: set DATABASE_URL or POSTGRES_HOST');
  }

  const cloudConfig = await buildCloudSqlPoolConfig();
  if (cloudConfig) {
    pool = new Pool(cloudConfig);
    logger.info('PostgreSQL pool created via Cloud SQL Connector');
  } else {
    pool = new Pool(buildDirectPoolConfig());
    logger.info('PostgreSQL pool created via direct TCP', { host: config.postgres.host });
  }

  pool.on('error', err => {
    logger.error('PostgreSQL pool error', { error: String(err) });
    resetPool();
  });

  poolCreatedAt = new Date();
  return pool;
}

export async function pgQuery<T extends QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= QUERY_RETRY_LIMIT; attempt++) {
    const p = await getPool();
    try {
      const result = await p.query<T>(text, params);
      return result;
    } catch (error) {
      lastError = error;
      if (isConnectionError(error) && attempt < QUERY_RETRY_LIMIT) {
        logger.warn('Connection error, recycling pool and retrying', { attempt: attempt + 1 });
        resetPool();
        await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS));
        continue;
      }
      logger.error('PG query failed', { query: text.substring(0, 80), error: String(error) });
      throw error;
    }
  }

  throw lastError;
}

export type TxQuery = <T extends QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

/**
 * Esegue `fn` dentro una transazione su un client dedicato del pool.
 * Garantisce BEGIN/COMMIT/ROLLBACK e rilascio del client.
 * Usare per scritture multi-statement che devono essere atomiche
 * (es. swap del dataset NAR corrente).
 */
export async function pgTransaction<T>(fn: (q: TxQuery) => Promise<T>): Promise<T> {
  const p = await getPool();
  const client: PoolClient = await p.connect();
  const txQuery = ((text: string, params?: unknown[]) => client.query(text, params)) as TxQuery;
  try {
    await client.query('BEGIN');
    const result = await fn(txQuery);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error('Rollback failed', { error: String(rollbackErr) });
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function checkPostgresConnection(): Promise<{ connected: boolean; version?: string; error?: string }> {
  try {
    const result = await pgQuery<{ version: string }>('SELECT version()');
    return { connected: true, version: result.rows[0]?.version };
  } catch (error) {
    return { connected: false, error: String(error) };
  }
}
