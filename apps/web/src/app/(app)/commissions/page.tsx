'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';

interface Entry {
  id: string;
  status: string;
  commissionAmount: number;
  ruleType: string;
  distributor: { name: string };
  operator: { name: string } | null;
}

export default function CommissionsPage() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [free, setFree] = useState<Array<{ id: string; note: string }>>([]);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [distributorId, setDistributorId] = useState('');

  async function load() {
    const [ledger, excluded] = await Promise.all([
      apiFetch('/api/v1/commission-ledger'),
      apiFetch('/api/v1/commission-ledger/free-exclusions'),
    ]);
    if (ledger.ok) setRows(((await ledger.json()) as { items: Entry[] }).items);
    if (excluded.ok) setFree((await excluded.json()) as Array<{ id: string; note: string }>);
  }

  useEffect(() => {
    void load();
  }, []);

  async function approve() {
    const ids = rows.filter((row) => row.status === 'PENDING').map((row) => row.id);
    await apiFetch('/api/v1/commission-ledger/approve', { method: 'POST', body: JSON.stringify({ ids }) });
    await load();
  }

  async function payout(event: FormEvent) {
    event.preventDefault();
    await apiFetch('/api/v1/commission-ledger/payouts', {
      method: 'POST',
      body: JSON.stringify({ distributorId, period, method: 'BANK_TRANSFER', reference: `PAY-${period}` }),
    });
    await load();
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Commission</h1>
        <Button onClick={() => void approve()}>Approve pending</Button>
      </div>
      <DataTable
        data={rows}
        columns={[
          { id: 'who', header: 'Distributor', cell: ({ row }) => row.original.distributor.name },
          { id: 'op', header: 'Operator', cell: ({ row }) => row.original.operator?.name ?? '—' },
          { id: 'rule', header: 'Rule', cell: ({ row }) => row.original.ruleType },
          { id: 'amount', header: 'Amount', cell: ({ row }) => row.original.commissionAmount },
          { id: 'status', header: 'Status', cell: ({ row }) => row.original.status },
        ]}
      />
      <form onSubmit={(event) => void payout(event)} className="flex flex-wrap gap-2">
        <Input placeholder="Distributor user id" value={distributorId} onChange={(event) => setDistributorId(event.target.value)} />
        <Input value={period} onChange={(event) => setPeriod(event.target.value)} />
        <Button type="submit">Create payout</Button>
      </form>
      <div className="rounded-2xl border border-border bg-card p-4 text-sm">
        <h2 className="font-semibold">Free period — no commission</h2>
        <ul className="mt-2 space-y-1">{free.map((row) => <li key={row.id}>{row.note}</li>)}</ul>
      </div>
    </section>
  );
}
