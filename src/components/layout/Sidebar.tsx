'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { useAuthStore } from '@/lib/store/auth';
import { getOwnerByEmail, isCustomerSuccessTeamMember } from '@/lib/config/owners';
import { cn } from '@/lib/utils/cn';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  Bell,
  BarChart3,
  LogOut,
  ChevronDown,
  Building2,
  GraduationCap,
  Database,
  AlertTriangle,
  HeartHandshake,
} from 'lucide-react';

const CLIENT_SECTIONS = [
  { href: '/clients?section=company', label: 'Company Owner', icon: Building2, section: 'company' },
  { href: '/clients?section=onboarding', label: 'Onboarding Owner', icon: GraduationCap, section: 'onboarding' },
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSection = searchParams.get('section') ?? '';
  const { user, signOut: clearAuth } = useAuthStore();
  const isOwner = !!getOwnerByEmail(user?.email ?? '');
  const isCs = isCustomerSuccessTeamMember(getOwnerByEmail(user?.email ?? ''));

  async function handleSignOut() {
    const auth = getFirebaseAuth();
    await signOut(auth);
    clearAuth();
  }

  return (
    <aside className="flex flex-col w-60 shrink-0 h-screen bg-slate-900 text-slate-100">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-sm">Post-Sales CS</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {/* Dashboard */}
        <Link
          href="/dashboard"
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
            pathname === '/dashboard' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          )}
        >
          <LayoutDashboard className="w-4 h-4 shrink-0" />
          Dashboard
        </Link>

        {/* Clienti — due sottovoci (company / onboarding), vista flat per manager */}
        {isOwner ? (
          <div>
            <div className="flex items-center gap-3 px-3 py-2 text-sm text-slate-500">
              <Users className="w-4 h-4 shrink-0" />
              <span>Clienti</span>
            </div>
            <div className="ml-4 space-y-0.5">
              {CLIENT_SECTIONS.map(({ href, label, icon: Icon, section }) => {
                const active = pathname === '/clients' && currentSection === section;
                return (
                  <Link
                    key={section}
                    href={href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                      active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <Link
            href="/clients"
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname.startsWith('/clients') ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            )}
          >
            <Users className="w-4 h-4 shrink-0" />
            Clienti
          </Link>
        )}

        {isCs && (
          <div>
            <div className="flex items-center gap-3 px-3 py-2 text-sm text-slate-500">
              <HeartHandshake className="w-4 h-4 shrink-0" />
              <span>Customer Success</span>
            </div>
            <div className="ml-4 space-y-0.5">
              {[
                { href: '/customer-success/dashboard', label: 'Dashboard CS' },
                { href: '/customer-success/pipeline', label: 'Pipeline CS' },
                { href: '/customer-success/clients', label: 'Clienti CS' },
              ].map(({ href, label }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                      active ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Task, Alert, Report */}
        {[
          { href: '/tasks', label: 'Task', Icon: CheckSquare },
          { href: '/alerts', label: 'Alert', Icon: Bell },
          { href: '/churn-tracker', label: 'Churn Tracker', Icon: AlertTriangle },
          { href: '/reports', label: 'Report', Icon: BarChart3 },
        ].map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname === href ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* DB usage */}
      <DbUsageBar />

      {/* User + sign out */}
      <div className="px-3 py-4 border-t border-slate-800">
        {user && (
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-xs font-semibold text-white shrink-0">
              {(user.displayName ?? user.email ?? 'U')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">{user.displayName ?? user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Esci
        </button>
      </div>
    </aside>
  );
}

function DbUsageBar() {
  const [usage, setUsage] = useState<{ pct: number; pretty: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const r = await fetch('/api/v1/system/db-usage');
        const d = await r.json() as { pct: number; pretty: string };
        if (mounted) setUsage(d);
      } catch { /* ignore */ }
    }
    load();
    const iv = setInterval(load, 60_000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  if (!usage) return null;

  const color = usage.pct >= 90 ? 'bg-red-500' : usage.pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="px-4 py-3 border-t border-slate-800">
      <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1.5">
        <Database className="w-3 h-3 shrink-0" />
        <span>{usage.pretty} ({usage.pct}%)</span>
      </div>
      <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(usage.pct, 100)}%` }}
        />
      </div>
    </div>
  );
}
