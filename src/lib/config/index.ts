export const config = {
  app: {
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
  },
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  },
  postgres: {
    host: process.env.POSTGRES_HOST || '',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DATABASE || 'post_sales',
    user: process.env.POSTGRES_USER || '',
    password: process.env.POSTGRES_PASSWORD || '',
    ssl: process.env.POSTGRES_SSL === 'true',
    instanceConnectionName: process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME || '',
  },
  hubspot: {
    apiKey: process.env.HUBSPOT_API_KEY || '',
    baseUrl: 'https://api.hubapi.com',
  },
  auth: {
    allowedDomains: (process.env.ALLOWED_EMAIL_DOMAINS || '').split(',').map(d => d.trim()).filter(Boolean),
  },
  devLogin: {
    enabled: process.env.ENABLE_DEV_LOGIN === 'true' && process.env.NODE_ENV !== 'production',
  },
  cron: {
    secret: process.env.CRON_SECRET || '',
  },
  googleChat: {
    /** Resource name e.g. spaces/AAQAXowZpvE — Google Chat API spaces.messages.list */
    releaseSpaceId: (process.env.GOOGLE_CHAT_RELEASE_SPACE_ID || '').trim(),
  },
  metabase: {
    url: process.env.METABASE_URL || 'https://metabase.spoki.com',
    apiKey: process.env.METABASE_API_KEY || '',
    databaseId: parseInt(process.env.METABASE_DATABASE_ID || '2', 10),
  },
  stripe: {
    apiKey: process.env.STRIPE_API_KEY || '',
  },
  gmail: {
    user: process.env.GMAIL_USER || '',
    appPassword: process.env.GMAIL_APP_PASSWORD || '',
  },
};

export function isConfigured(service: 'hubspot' | 'postgres' | 'metabase' | 'stripe' | 'gmail'): boolean {
  if (service === 'hubspot') return !!config.hubspot.apiKey;
  if (service === 'postgres') return !!(config.postgres.host || config.postgres.instanceConnectionName) && !!config.postgres.user;
  if (service === 'metabase') return !!config.metabase.apiKey;
  if (service === 'stripe') return !!config.stripe.apiKey;
  if (service === 'gmail') return !!config.gmail.user && !!config.gmail.appPassword;
  return false;
}
