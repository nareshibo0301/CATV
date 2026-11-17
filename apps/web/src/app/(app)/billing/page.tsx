'use client';

import { useEffect, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { apiFetch } from '@/lib/api';

interface Invoice {
  id: string;
  number: string;
  status: string;
  total: number;
  amountPaid: number;
  outstanding: number;
  customer: { name: string; userCode: string | null };
  dueAt: string;
}

export default function BillingPage() {
  const [rows, setRows] = useState<Invoice[]>([]);
  useEffect(() => {
    void apiFetch('/api/v1/invoices').then(async (response) => {
      if (!response.ok) return;
      const body = (await response.json()) as { items: Invoice[] };
      setRows(body.items);
    });
  }, []);
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-semibold">Billing</h1>
      <DataTable
        data={rows}
        columns={[
          { id: 'number', header: 'Invoice', cell: ({ row }) => row.original.number },
          { id: 'customer', header: 'Customer', cell: ({ row }) => row.original.customer.userCode ?? row.original.customer.name },
          { id: 'status', header: 'Status', cell: ({ row }) => row.original.status },
          { id: 'total', header: 'Total', cell: ({ row }) => row.original.total },
          { id: 'due', header: 'Outstanding', cell: ({ row }) => row.original.outstanding },
          { id: 'when', header: 'Due', cell: ({ row }) => new Date(row.original.dueAt).toLocaleDateString() },
        ]}
      />
    </section>
  );
}
