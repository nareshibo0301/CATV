'use client';

import type { AuthUser, Role } from '@catv/shared';
import { ADMIN_TYPE_LABELS, ROLE_LABELS } from '@catv/shared';
import {
  Cable,
  LayoutDashboard,
  LogOut,
  Menu,
  Plug,
  Receipt,
  ScrollText,
  Settings,
  Shield,
  Table,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ThemeToggle } from './theme-toggle';

const LINKS: Array<{ href: string; label: string; roles: Role[]; icon: LucideIcon }> = [
  { href: '/dashboard', label: 'Dashboard', roles: ['ADMIN', 'DISTRIBUTOR', 'OPERATOR', 'CUSTOMER'], icon: LayoutDashboard },
  { href: '/connections', label: 'Connections', roles: ['ADMIN', 'DISTRIBUTOR', 'OPERATOR', 'CUSTOMER'], icon: Cable },
  { href: '/billing', label: 'Billing', roles: ['ADMIN', 'DISTRIBUTOR', 'OPERATOR', 'CUSTOMER'], icon: Receipt },
  { href: '/commissions', label: 'Commission', roles: ['ADMIN', 'DISTRIBUTOR', 'OPERATOR'], icon: Wallet },
  { href: '/reports', label: 'Reports', roles: ['ADMIN', 'DISTRIBUTOR', 'OPERATOR'], icon: Table },
  { href: '/plans', label: 'Plans', roles: ['ADMIN'], icon: Shield },
  { href: '/integrations', label: 'Integrations', roles: ['ADMIN'], icon: Plug },
  { href: '/users', label: 'Users', roles: ['ADMIN', 'DISTRIBUTOR', 'OPERATOR'], icon: Users },
  { href: '/settings', label: 'Settings', roles: ['ADMIN'], icon: Settings },
  { href: '/audit', label: 'Audit log', roles: ['ADMIN'], icon: ScrollText },
  { href: '/admin', label: 'Admin', roles: ['ADMIN'], icon: Shield },
];

export function Shell({ user, children }: { user: AuthUser; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = LINKS.filter((link) => link.roles.includes(user.role));

  async function logout() {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login';
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-[var(--on-primary)]"
      >
        Skip to content
      </a>
      <div className="flex min-h-screen">
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-border bg-sidebar p-5 transition-transform duration-300 md:static md:translate-x-0 ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="mb-8 flex items-center gap-3">
            <span className="gold-gradient inline-flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-[var(--on-primary)]">
              C
            </span>
            <span>
              <span className="block text-lg font-semibold tracking-wide">CATV</span>
              <span className="block text-xs text-muted-foreground">Cable network</span>
            </span>
          </div>
          <nav aria-label="Primary" className="space-y-1">
            {links.map((link) => {
              const active =
                link.href === '/dashboard'
                  ? pathname === link.href
                  : pathname === link.href || (link.href !== '/' && pathname.startsWith(`${link.href}`));
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    active ? 'nav-active' : 'text-foreground hover:bg-muted'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={18} />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        {open ? (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-30 bg-[color-mix(in_srgb,var(--charcoal)_55%,transparent)] md:hidden"
            onClick={() => setOpen(false)}
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 md:px-8">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border md:hidden"
              aria-label={open ? 'Close navigation' : 'Open navigation'}
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              <p className="truncate font-semibold">{user.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full border border-border px-3 py-1 text-xs font-medium text-primary-deep dark:text-primary-light sm:inline">
                {ROLE_LABELS[user.role]}
                {user.adminType ? ` · ${ADMIN_TYPE_LABELS[user.adminType]}` : ''}
              </span>
              <ThemeToggle />
              <button
                type="button"
                onClick={() => void logout()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border hover:bg-muted"
                aria-label="Sign out"
              >
                <LogOut size={18} />
              </button>
            </div>
          </header>
          <main id="main" className="flex-1 p-4 md:p-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
