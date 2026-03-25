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
};

export function isConfigured(service: 'hubspot' | 'postgres'): boolean {
  if (service === 'hubspot') return !!config.hubspot.apiKey;
  if (service === 'postgres') return !!(config.postgres.host || config.postgres.instanceConnectionName) && !!config.postgres.user;
  return false;
}
