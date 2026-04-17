'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { useAuthStore } from '@/lib/store/auth';
import { getOwnerByEmail, isAdminEmail, isCustomerSuccessTeamMember } from '@/lib/config/owners';
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
  GraduationCap,
  HeartHandshake,
  Database,
  AlertTriangle,
  Phone,
} from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut: clearAuth } = useAuthStore();
  const isAdmin = isAdminEmail(user?.email ?? '');
  const isCs = isCustomerSuccessTeamMember(getOwnerByEmail(user?.email ?? ''));

  async function handleSignOut() {
    const auth = getFirebaseAuth();
    await signOut(auth);
    clearAuth();
  }

  return (
    <aside className="flex flex-col w-60 shrink-0 h-screen bg-slate-950 text-slate-50">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
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
            pathname === '/dashboard' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          )}
        >
          <LayoutDashboard className="w-4 h-4 shrink-0" />
          Dashboard
        </Link>

        {/* Onboarding Hub */}
        <div>
          <div className="flex items-center gap-3 px-3 py-2 text-sm text-slate-500">
            <GraduationCap className="w-4 h-4 shrink-0" />
            <span>Onboarding</span>
          </div>
          <div className="ml-4 space-y-0.5">
            {[
              { href: '/onboarding-hub/dashboard', label: 'Dashboard' },
              { href: '/onboarding-hub/pipeline', label: 'Pipeline' },
              { href: '/onboarding-hub/clients', label: 'Portfolio Clienti' },
            ].map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                    active ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </div>

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
                      active ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Task, Alert, Churn, Report (+ Attivazioni admin) */}
        {[
          { href: '/tasks', label: 'Task', Icon: CheckSquare },
          { href: '/alerts', label: 'Alert', Icon: Bell },
          { href: '/churn-tracker', label: 'Churn Tracker', Icon: AlertTriangle },
          ...(isAdmin ? [
            { href: '/team-reports', label: 'Attivazioni - Report', Icon: Phone },
            { href: '/training-reports', label: 'Training - Report', Icon: GraduationCap }
          ] as const : []),
          { href: '/reports', label: 'Report', Icon: BarChart3 },
        ].map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname === href ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
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
            <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-semibold text-white shrink-0">
              {(user.displayName ?? user.email ?? 'U')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">{user.displayName ?? user.email}</p>
              {isAdmin && (
                <p className="mt-0.5 inline-flex items-center rounded-full bg-emerald-700/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-100">
                  Admin
                </p>
              )}
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
      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(usage.pct, 100)}%` }}
        />
      </div>
    </div>
  );
}
