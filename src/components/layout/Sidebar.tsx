'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { useAuthStore } from '@/lib/store/auth';
import { cn } from '@/lib/utils/cn';
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  Bell,
  BarChart3,
  LogOut,
} from 'lucide-react';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clienti', icon: Users },
  { href: '/tasks', label: 'Task', icon: CheckSquare },
  { href: '/alerts', label: 'Alert', icon: Bell },
  { href: '/reports', label: 'Report', icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut: clearAuth } = useAuthStore();

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
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

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
