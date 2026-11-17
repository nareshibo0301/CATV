'use client';

import type { Role, UserStatus } from '@catv/shared';
import { ROLE_LABELS } from '@catv/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { errorMessage } from '@/lib/http';

interface UserDetail {
  id: string;
  userCode: string | null;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  customData: Record<string, unknown>;
  parent: { id: string; name: string; userCode: string | null; role: Role } | null;
}

interface AttributeField {
  key: string;
  label: string;
}

interface CommissionRule {
  id: string;
  type: string;
  value: string;
  effectiveFrom: string;
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await apiFetch(`/api/v1/users/${params.id}`);
    if (!response.ok) {
      setError(await errorMessage(response));
      return;
    }
    const body = (await response.json()) as UserDetail;
    setUser(body);
    const attributes = await apiFetch(`/api/v1/attributes?role=${body.role}&userId=${body.id}`);
    if (attributes.ok) {
      const fields = (await attributes.json()) as AttributeField[];
      setLabels(Object.fromEntries(fields.map((field) => [field.key, field.label])));
    }
    const commission = await apiFetch(`/api/v1/users/${body.id}/commission-rules`);
    if (commission.ok) setRules((await commission.json()) as CommissionRule[]);
  }

  useEffect(() => {
    void load();
    // load is recreated each render; the id is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function act(path: string, method: 'POST' | 'DELETE') {
    const response = await apiFetch(`/api/v1/users/${params.id}${path}`, { method });
    if (!response.ok) {
      setError(await errorMessage(response));
      return;
    }
    if (method === 'DELETE') router.push('/users');
    else await load();
  }

  if (!user) return <p className="text-sm text-muted-foreground">{error ?? 'Loading…'}</p>;

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-primary-deep dark:text-primary-light">{user.userCode ?? 'Admin account'}</p>
          <h1 className="text-3xl font-semibold">{user.name}</h1>
          <p className="text-sm text-muted-foreground">{ROLE_LABELS[user.role]} · {user.status}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/users/${user.id}/edit`} className="rounded-lg border border-border px-3 py-2 text-sm">Edit</Link>
          {user.status === 'ACTIVE' ? <Button variant="ghost" onClick={() => void act('/suspend', 'POST')}>Suspend</Button> : null}
          {user.status === 'SUSPENDED' ? <Button variant="ghost" onClick={() => void act('/reactivate', 'POST')}>Reactivate</Button> : null}
          <Button variant="ghost" onClick={() => void act('', 'DELETE')}>Delete</Button>
        </div>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <dl className="grid gap-3 rounded-2xl border border-border bg-card p-6 md:grid-cols-2">
        <Item label="Email" value={user.email} />
        <Item label="Phone" value={user.phone ?? '—'} />
        <Item label="Reports to" value={user.parent ? `${user.parent.userCode ?? ''} ${user.parent.name}` : '—'} />
        {Object.entries(user.customData).map(([key, value]) => (
          <Item key={key} label={labels[key] ?? key} value={String(value)} />
        ))}
      </dl>
      {rules.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-semibold">Commission history</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {rules.map((rule) => (
              <li key={rule.id}>
                {rule.type === 'PERCENTAGE' ? `${rule.value}%` : rule.value} from {new Date(rule.effectiveFrom).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
