import { getMe } from '@/lib/session';
import { DashboardView } from './dashboard-view';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const me = await getMe();
  if (!me) return null;
  return <DashboardView name={me.name} />;
}
