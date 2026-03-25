import { config } from '@/lib/config';

export function isEmailDomainAllowed(email: string): boolean {
  const { allowedDomains } = config.auth;
  if (allowedDomains.length === 0) return true;
  const domain = email.split('@')[1]?.toLowerCase();
  return !!domain && allowedDomains.map(d => d.toLowerCase()).includes(domain);
}
