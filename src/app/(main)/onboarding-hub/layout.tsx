'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { getOwnerByEmail, isAdminEmail } from '@/lib/config/owners';

const OB_NAV = [
  { href: '/onboarding-hub/dashboard', label: 'Dashboard' },
  { href: '/onboarding-hub/pipeline', label: 'Pipeline' },
  { href: '/onboarding-hub/clients', label: 'Clienti' },
] as const;

export default function OnboardingHubLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();

  const owner = getOwnerByEmail(user?.email ?? '');
  const isAdmin = isAdminEmail(user?.email);
  const hasAccess = !!owner || isAdmin;

  useEffect(() => {
    if (user && !hasAccess) router.replace('/dashboard');
  }, [user, hasAccess, router]);

  if (!hasAccess) {
    return <div className="p-6 text-slate-500">Accesso negato.</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Onboarding</h1>
        <p className="text-sm text-slate-500 mt-0.5">Gestione onboarding clienti dal tuo portfolio HubSpot</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {OB_NAV.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              pathname === item.href
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {children}
    </div>
  );
}
