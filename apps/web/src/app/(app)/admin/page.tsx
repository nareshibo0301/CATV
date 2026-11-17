import { redirect } from 'next/navigation';
import { ADMIN_TYPE_LABELS } from '@catv/shared';
import { Card } from '@/components/ui/card';
import { getMe, serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }
  if (me.role !== 'ADMIN') {
    redirect('/forbidden');
  }

  const ping = await serverApi('/api/v1/admin/ping');
  if (ping.status === 403) {
    redirect('/forbidden');
  }
  if (!ping.ok) {
    redirect('/login');
  }
  const body = (await ping.json()) as { ok: boolean; adminType: typeof me.adminType };

  return (
    <section className="animate-rise mx-auto max-w-3xl">
      <Card>
        <p className="text-sm uppercase tracking-[0.2em] text-primary-deep dark:text-primary-light">Admin</p>
        <h1 className="mt-2 text-3xl font-semibold">Admin area</h1>
        <p className="mt-3 text-muted-foreground">
          Signed in as {body.adminType ? ADMIN_TYPE_LABELS[body.adminType] : 'Admin'}. Developer, Super
          Admin, and Admin all reach this area.
        </p>
      </Card>
    </section>
  );
}
