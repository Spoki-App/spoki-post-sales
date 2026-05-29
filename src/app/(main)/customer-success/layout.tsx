'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/lib/store/auth';
import { getOwnerByEmail, isCustomerSuccessTeamMember } from '@/lib/config/owners';

const CS_NAV = [
  { href: '/customer-success/dashboard', label: 'Dashboard CS' },
  { href: '/customer-success/pipeline', label: 'Pipeline CS' },
  { href: '/customer-success/clients', label: 'Clienti CS' },
] as const;

export default function CustomerSuccessLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();
  const allowed = isCustomerSuccessTeamMember(getOwnerByEmail(user?.email));

  useEffect(() => {
    if (user && !allowed) router.replace('/dashboard');
  }, [user, allowed, router]);

  if (user && !allowed) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <p className="text-slate-600 text-sm">Accesso negato: area riservata al team Customer Success.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Customer Success</h1>
        <p className="text-sm text-slate-500 mt-1">Strumenti e pipeline per il team CS (dati legati al tuo utente HubSpot).</p>
      </div>
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {CS_NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              pathname === href
                ? 'border-violet-600 text-violet-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            {label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
