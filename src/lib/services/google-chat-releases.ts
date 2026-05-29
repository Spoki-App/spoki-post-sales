import { config } from '@/lib/config';
import { getLogger } from '@/lib/logger';

const logger = getLogger('services:google-chat-releases');

const CHAT_API = 'https://chat.googleapis.com/v1';
/** Service account + Chat app nello space */
const SCOPE_APP = 'https://www.googleapis.com/auth/chat.app.messages.readonly';
/** OAuth utente: l'utente che ha autorizzato deve essere membro dello space */
const SCOPE_USER = 'https://www.googleapis.com/auth/chat.messages.readonly';

const MAX_CHARS = 14_000;
const PAGE_SIZE = 100;

function loadServiceAccountJson(): Record<string, unknown> | null {
  const b64 = process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_BASE64?.trim();
  if (b64) {
    try {
      return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as Record<string, unknown>;
    } catch {
      logger.warn('GOOGLE_CHAT_SERVICE_ACCOUNT_BASE64 non valido');
      return null;
    }
  }
  const raw = process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      logger.warn('GOOGLE_CHAT_SERVICE_ACCOUNT_JSON non valido');
      return null;
    }
  }
  return null;
}

function normalizeSpaceResource(id: string): string {
  const t = id.trim();
  if (!t) return '';
  return t.startsWith('spaces/') ? t : `spaces/${t}`;
}

function isOAuthConfigured(): boolean {
  const id = process.env.GOOGLE_CHAT_OAUTH_CLIENT_ID?.trim();
  const sec = process.env.GOOGLE_CHAT_OAUTH_CLIENT_SECRET?.trim();
  const rt = process.env.GOOGLE_CHAT_OAUTH_REFRESH_TOKEN?.trim();
  return !!(id && sec && rt);
}

export function isGoogleChatReleasesConfigured(): boolean {
  return !!(config.googleChat.releaseSpaceId && (loadServiceAccountJson() || isOAuthConfigured()));
}

async function getChatAccessToken(): Promise<string | null> {
  const sa = loadServiceAccountJson();
  if (sa) {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({ credentials: sa, scopes: [SCOPE_APP] });
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();
    return token ?? null;
  }

  const clientId = process.env.GOOGLE_CHAT_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CHAT_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_CHAT_OAUTH_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;

  const { OAuth2Client } = await import('google-auth-library');
  const oauth2 = new OAuth2Client(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  const { token } = await oauth2.getAccessToken();
  return token ?? null;
}

type ChatListResponse = {
  messages?: ChatMsg[];
  nextPageToken?: string;
};

type ChatMsg = {
  createTime?: string;
  text?: string;
  formattedText?: string;
  sender?: { displayName?: string };
};

function messageLine(m: ChatMsg): string {
  const body = (m.text || m.formattedText || '').replace(/\s+/g, ' ').trim();
  const who = m.sender?.displayName?.trim();
  const when = m.createTime ? m.createTime.slice(0, 10) : '';
  if (!body) return '';
  const prefix = [when, who].filter(Boolean).join(' ');
  return prefix ? `${prefix} | ${body}` : body;
}

/**
 * Messaggi dello space release nel periodo indicato.
 * Auth A) service account dell'app Chat nello space, oppure B) OAuth utente (refresh token) con utente membro dello space.
 */
export async function fetchReleaseSpaceDigestForQbr(since: Date): Promise<string> {
  const parent = normalizeSpaceResource(config.googleChat.releaseSpaceId);
  if (!parent || !isGoogleChatReleasesConfigured()) return '';

  const sinceIso = since.toISOString();
  const filter = `createTime > "${sinceIso}"`;

  try {
    const token = await getChatAccessToken();
    if (!token) {
      logger.warn('Google Chat: access token vuoto');
      return '';
    }

    const lines: string[] = [];
    let pageToken: string | undefined;
    let total = 0;

    do {
      const u = new URL(`${CHAT_API}/${parent}/messages`);
      u.searchParams.set('pageSize', String(PAGE_SIZE));
      u.searchParams.set('filter', filter);
      if (pageToken) u.searchParams.set('pageToken', pageToken);

      const res = await fetch(u.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errBody = await res.text();
        logger.warn('Google Chat API list messages failed', { status: res.status, body: errBody.slice(0, 400) });
        return '';
      }

      const data = (await res.json()) as ChatListResponse;
      const msgs = data.messages ?? [];
      for (const m of msgs) {
        const line = messageLine(m);
        if (!line) continue;
        const add = line.length + 1;
        if (total + add > MAX_CHARS) break;
        lines.push(line);
        total += add;
      }
      pageToken = data.nextPageToken;
      if (total >= MAX_CHARS) break;
    } while (pageToken);

    if (lines.length === 0) return '';

    return lines.join('\n');
  } catch (e) {
    logger.warn('Google Chat release fetch error', { error: String(e) });
    return '';
  }
}
