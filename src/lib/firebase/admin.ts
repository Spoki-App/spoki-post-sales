import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getLogger } from '@/lib/logger';

const logger = getLogger('firebase:admin');

function getServiceAccount(): Record<string, string> | null {
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (base64) {
    try {
      return JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
    } catch {
      logger.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_BASE64');
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return {
      type: 'service_account',
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n'),
    };
  }

  return null;
}

let adminApp: App;

function getAdminApp(): App {
  if (adminApp) return adminApp;

  const existing = getApps().find(a => a.name === '[DEFAULT]');
  if (existing) {
    adminApp = existing;
    return adminApp;
  }

  const sa = getServiceAccount();
  if (!sa) {
    throw new Error('Firebase Admin: no service account credentials found. Set FIREBASE_SERVICE_ACCOUNT_BASE64 or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.');
  }

  adminApp = initializeApp({ credential: cert(sa as Parameters<typeof cert>[0]) });
  return adminApp;
}

export async function verifyIdToken(token: string) {
  const auth = getAuth(getAdminApp());
  return auth.verifyIdToken(token);
}
