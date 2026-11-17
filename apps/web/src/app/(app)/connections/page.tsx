'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Cable, Plus, RefreshCw } from 'lucide-react';
import { DataTable, StatusBadge } from '@/components/data-table';
import { Select } from '@/components/ui/select';
import { apiFetch } from '@/lib/api';

interface Row {
  id: string;
  status: string;
  activationType: string | null;
  customer: { name: string; userCode: string | null };
  plan: { name: string; price: number };
  distributor: { name: string } | null;
  operator: { name: string } | null;
}

export default function ConnectionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: '50' });
    if (status) params.set('status', status);
    try {
      const response = await apiFetch(`/api/v1/connections?${params}`);
      if (response.ok) {
        const body = (await response.json()) as { items: Row[]; total: number };
        setRows(body.items);
        setTotal(body.total);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            Network Connections
            <span className="h-2 w-2 rounded-full bg-wine-neon animate-pulse-dot" />
          </h1>
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            {total} Active Drops & Nodes in Scope
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card/60 text-muted-foreground transition hover:border-wine-neon hover:text-foreground"
            title="Refresh list"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <Link
            href="/connections/new"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-glow transition hover:bg-primary-light active:scale-[0.98]"
          >
            <Plus size={16} />
            Publish Connection
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-64">
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Status: All Nodes</option>
            <option value="PENDING_ACTIVATION">Pending Activation</option>
            <option value="ACTIVE_PAID">Active (Paid)</option>
            <option value="ACTIVE_FREE">Active (Free Offer)</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="DISCONNECTED">Disconnected</option>
          </Select>
        </div>
      </div>

      <DataTable
        data={rows}
        searchPlaceholder="Search customer, code, or plan…"
        columns={[
          {
            id: 'customer',
            header: 'Customer / Node ID',
            cell: ({ row }) => (
              <div className="space-y-0.5">
                <Link
                  className="font-semibold text-foreground underline-offset-2 hover:text-wine-neon hover:underline flex items-center gap-1 group"
                  href={`/connections/${row.original.id}`}
                >
                  {row.original.customer.name}
                  <ArrowUpRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity text-wine-neon" />
                </Link>
                <p className="text-xs font-mono text-muted-foreground">
                  {row.original.customer.userCode ?? 'DIRECT'}
                </p>
              </div>
            ),
          },
          {
            id: 'plan',
            header: 'Plan Package',
            cell: ({ row }) => (
              <div className="space-y-0.5">
                <span className="font-medium text-foreground">{row.original.plan.name}</span>
                <p className="text-xs font-mono text-muted-foreground">₹{row.original.plan.price}/mo</p>
              </div>
            ),
          },
          {
            id: 'status',
            header: 'Connection Status',
            cell: ({ row }) => <StatusBadge status={row.original.status} />,
          },
          {
            id: 'type',
            header: 'Billing Type',
            cell: ({ row }) => (
              <span className="font-mono text-xs uppercase text-muted-foreground">
                {row.original.activationType ?? 'UNASSIGNED'}
              </span>
            ),
          },
          {
            id: 'owner',
            header: 'Operator Node',
            cell: ({ row }) => (
              <span className="text-xs font-medium text-foreground">
                {row.original.operator?.name ?? row.original.distributor?.name ?? 'Direct Feed'}
              </span>
            ),
          },
          {
            id: 'action',
            header: '',
            cell: ({ row }) => (
              <Link
                href={`/connections/${row.original.id}`}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-card/60 px-2.5 py-1 text-xs font-mono text-muted-foreground transition hover:border-wine-neon hover:text-foreground"
              >
                Inspect
              </Link>
            ),
          },
        ]}
      />
    </section>
  );
}
