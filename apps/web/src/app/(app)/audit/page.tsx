'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  ip: string | null;
  createdAt: string;
  before: unknown;
  after: unknown;
  actor: { name: string; email: string } | null;
}

const columns: ColumnDef<AuditRow, unknown>[] = [
  { id: 'when', header: 'When', cell: ({ row }) => new Date(row.original.createdAt).toLocaleString() },
  { id: 'actor', header: 'Who', cell: ({ row }) => row.original.actor?.name ?? 'System' },
  { id: 'action', header: 'Action', cell: ({ row }) => row.original.action },
  { id: 'entity', header: 'Record', cell: ({ row }) => `${row.original.entity} ${row.original.entityId ?? ''}` },
  { id: 'ip', header: 'IP', cell: ({ row }) => row.original.ip ?? '—' },
  {
    id: 'change',
    header: 'Change',
    cell: ({ row }) => (
      <details>
        <summary className="cursor-pointer">View</summary>
        <pre className="mt-2 max-w-md whitespace-pre-wrap text-xs">{JSON.stringify({ before: row.original.before, after: row.original.after }, null, 2)}</pre>
      </details>
    ),
  },
];

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (q.trim()) params.set('q', q.trim());
    void apiFetch(`/api/v1/audit?${params.toString()}`).then(async (response) => {
      if (!response.ok) return;
      const body = (await response.json()) as { items: AuditRow[]; total: number };
      setRows(body.items);
      setTotal(body.total);
    });
  }, [page, q]);

  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-semibold">Audit log</h1>
      <Input placeholder="Search action or record id" value={q} onChange={(event) => { setPage(1); setQ(event.target.value); }} />
      <DataTable columns={columns} data={rows} />
      <div className="flex items-center gap-2">
        <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
        <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
        <Button variant="ghost" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</Button>
      </div>
    </section>
  );
}
