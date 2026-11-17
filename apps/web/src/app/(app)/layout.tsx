import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/layout/shell';
import { getMe } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }
  return <Shell user={me}>{children}</Shell>;
}
