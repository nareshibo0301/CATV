'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import { errorMessage } from '@/lib/http';

interface Detail {
  id: string;
  status: string;
  activationType: string | null;
  customer: { name: string; userCode: string | null };
  plan: { name: string; price: number };
  history: Array<{ id: string; fromStatus: string | null; toStatus: string; reason: string | null; createdAt: string; actor: { name: string } | null }>;
  invoices: Array<{ id: string; number: string; status: string; total: number; amountPaid: number }>;
}

export default function ConnectionDetailPage() {
  const params = useParams<{ id: string }>();
  const [row, setRow] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'PAID' | 'FREE'>('PAID');
  const [reason, setReason] = useState<'INITIAL_OFFER' | 'LOYALTY_OFFER' | 'OTHER'>('INITIAL_OFFER');
  const [duration, setDuration] = useState<'1_MONTH' | '2_MONTHS' | 'CUSTOM'>('1_MONTH');
  const [amount, setAmount] = useState('');

  async function load() {
    const response = await apiFetch(`/api/v1/connections/${params.id}`);
    if (!response.ok) {
      setError(await errorMessage(response));
      return;
    }
    setRow((await response.json()) as Detail);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function activate() {
    const body = mode === 'PAID'
      ? { mode: 'PAID' }
      : { mode: 'FREE', startDate: new Date().toISOString(), duration, reason };
    const response = await apiFetch(`/api/v1/connections/${params.id}/activate`, { method: 'POST', body: JSON.stringify(body) });
    if (!response.ok) setError(await errorMessage(response));
    else await load();
  }

  async function pay(invoiceId: string) {
    const response = await apiFetch('/api/v1/payments', {
      method: 'POST',
      body: JSON.stringify({ invoiceId, amount: Number(amount), method: 'CASH' }),
    });
    if (!response.ok) setError(await errorMessage(response));
    else {
      setAmount('');
      await load();
    }
  }

  if (!row) return <p className="text-sm text-muted-foreground">{error ?? 'Loading…'}</p>;
  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <div>
        <p className="text-sm text-primary-deep dark:text-primary-light">{row.customer.userCode}</p>
        <h1 className="text-3xl font-semibold">{row.customer.name}</h1>
        <p className="text-sm text-muted-foreground">{row.plan.name} · {row.status} · {row.activationType ?? 'not activated'}</p>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {row.status === 'PENDING_ACTIVATION' || row.status === 'ACTIVE_PAID' ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold">Activation</h2>
          <Select value={mode} onChange={(event) => setMode(event.target.value as 'PAID' | 'FREE')}>
            <option value="PAID">Paid — invoice now</option>
            <option value="FREE">Free — admin only</option>
          </Select>
          {mode === 'FREE' ? (
            <div className="grid gap-2 md:grid-cols-2">
              <Select value={duration} onChange={(event) => setDuration(event.target.value as typeof duration)}>
                <option value="1_MONTH">1 month</option>
                <option value="2_MONTHS">2 months</option>
                <option value="CUSTOM">Custom</option>
              </Select>
              <Select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)}>
                <option value="INITIAL_OFFER">Initial offer</option>
                <option value="LOYALTY_OFFER">Loyalty offer</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
          ) : null}
          <Button onClick={() => void activate()}>Activate</Button>
        </div>
      ) : null}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Timeline</h2>
        <ol className="mt-3 space-y-2 text-sm">
          {row.history.map((item) => (
            <li key={item.id}>{new Date(item.createdAt).toLocaleString()} · {item.fromStatus ?? '—'} → {item.toStatus} · {item.reason} · {item.actor?.name ?? 'system'}</li>
          ))}
        </ol>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Invoices</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {row.invoices.map((invoice) => (
            <li key={invoice.id} className="flex flex-wrap items-center gap-2">
              <span>{invoice.number} · {invoice.status} · {invoice.amountPaid}/{invoice.total}</span>
              {invoice.status !== 'PAID' && invoice.status !== 'VOID' ? (
                <>
                  <Input className="max-w-28" placeholder="Amount" value={amount} onChange={(event) => setAmount(event.target.value)} />
                  <Button onClick={() => void pay(invoice.id)}>Record payment</Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
