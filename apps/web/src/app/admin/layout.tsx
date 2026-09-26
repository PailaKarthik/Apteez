'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  BookOpen,
  CalendarDays,
  FilePlus2,
  Flag,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  ScrollText,
  Trophy,
  Users,
} from 'lucide-react';
import { Button, Separator, Skeleton, cn } from '@apteez/ui';
import { PageHeader } from '@/components/shared/page-header';
import { useAuth, useLogout } from '@/hooks/use-auth';

interface NavEntry {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permissions: string[];
}

/** Mirrors backend areas; the backend re-checks every request regardless. */
const NAV: NavEntry[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, permissions: ['view:analytics'] },
  { href: '/admin/users', label: 'Users', icon: Users, permissions: ['manage:users'] },
  {
    href: '/admin/contributions',
    label: 'Contributions',
    icon: FilePlus2,
    permissions: ['review:contributions'],
  },
  { href: '/admin/problems', label: 'Problems', icon: BookOpen, permissions: ['manage:questions'] },
  {
    href: '/admin/discussions',
    label: 'Discussions',
    icon: MessagesSquare,
    permissions: ['moderate:discussions'],
  },
  {
    href: '/admin/reports',
    label: 'Reports',
    icon: Flag,
    permissions: ['moderate:discussions', 'view:analytics'],
  },
  { href: '/admin/contests', label: 'Contests', icon: Trophy, permissions: ['manage:contests'] },
  { href: '/admin/events', label: 'Events', icon: CalendarDays, permissions: ['manage:events'] },
  { href: '/admin/rewards', label: 'Rewards', icon: Award, permissions: ['manage:rewards'] },
  {
    href: '/admin/audit-logs',
    label: 'Audit logs',
    icon: ScrollText,
    permissions: ['view:analytics'],
  },
];

function canSee(entry: NavEntry, roles: string[], permissions: string[]): boolean {
  if (roles.includes('admin') || permissions.includes('manage:platform')) {
    return true;
  }
  return entry.permissions.some((permission) => permissions.includes(permission));
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { logout, isLoggingOut } = useLogout();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const roles = user?.roles ?? [];
  const permissions = user?.permissions ?? [];
  const isStaff =
    roles.includes('admin') ||
    permissions.some((permission) =>
      [
        'manage:users',
        'manage:questions',
        'review:contributions',
        'moderate:discussions',
        'manage:contests',
        'manage:events',
        'manage:rewards',
        'view:analytics',
        'manage:platform',
      ].includes(permission),
    );

  if (!user || !isStaff) {
    return (
      <div className="space-y-4">
        <PageHeader title="Admin" description="Restricted operations area." />
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-semibold">Admin access is required.</p>
            <p className="text-sm text-muted-foreground">
              {!user
                ? 'Sign in with a staff account to continue.'
                : 'Your account does not hold a staff role.'}
            </p>
            <Button variant="outline" size="sm" onClick={() => router.push('/login')}>
              Go to login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const visible = NAV.filter((entry) => canSee(entry, roles, permissions));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin"
        description={`${user.displayName} · ${roles.join(', ') || 'staff'}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">
                <ArrowLeft className="size-4" aria-hidden /> Site
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isLoggingOut}
              onClick={() => void logout()}
            >
              <LogOut className="size-4" aria-hidden /> Logout
            </Button>
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Admin sections" className="lg:sticky lg:top-20 lg:self-start">
          <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {visible.map((entry) => {
              const active = pathname === entry.href;
              return (
                <li key={entry.href} className="shrink-0">
                  <Link
                    href={entry.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-primary/10 font-semibold text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <entry.icon className="size-4" aria-hidden />
                    {entry.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <Separator className="my-3 hidden lg:block" />
          <p className="hidden px-3 text-xs text-muted-foreground lg:block">
            Hidden entries are a usability filter only — APIs enforce permissions.
          </p>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
