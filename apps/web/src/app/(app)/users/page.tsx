'use client';

import type { Role, UserStatus } from '@catv/shared';
import { ROLE_LABELS } from '@catv/shared';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Edit2, Plus } from 'lucide-react';
import { DataTable, StatusBadge } from '@/components/data-table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import { errorMessage } from '@/lib/http';

interface UserRow {
  id: string;
  userCode: string | null;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  customData: Record<string, unknown>;
  parent: { name: string; userCode: string | null } | null;
}

interface AttributeColumn {
  key: string;
  label: string;
}

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [attributeKey, setAttributeKey] = useState('');
  const [attributeValue, setAttributeValue] = useState('');
  const [attributes, setAttributes] = useState<AttributeColumn[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '25', sort: 'createdAt', dir: 'desc' });
    if (role) params.set('role', role);
    if (status) params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    if (attributeKey && attributeValue) {
      params.set('attributeKey', attributeKey);
      params.set('attributeValue', attributeValue);
    }
    void apiFetch(`/api/v1/users?${params.toString()}`).then(async (response) => {
      if (!response.ok) {
        setError(await errorMessage(response));
        return;
      }
      const body = (await response.json()) as { items: UserRow[]; total: number };
      setRows(body.items);
      setTotal(body.total);
      setError(null);
    });
  }, [page, role, status, q, attributeKey, attributeValue]);

  useEffect(() => {
    const params = role ? `?role=${role}` : '';
    void apiFetch(`/api/v1/attributes${params}`).then(async (response) => {
      if (!response.ok) return;
      setAttributes((await response.json()) as AttributeColumn[]);
    });
  }, [role]);

  const columns = useMemo<ColumnDef<UserRow, unknown>[]>(() => {
    const base: ColumnDef<UserRow, unknown>[] = [
      {
        id: 'code',
        header: 'User Code',
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold text-wine-neon">
            {row.original.userCode ?? 'ADMIN'}
          </span>
        ),
      },
      {
        id: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <Link
              className="font-medium text-foreground underline-offset-2 hover:text-wine-neon hover:underline flex items-center gap-1 group"
              href={`/users/${row.original.id}`}
            >
              {row.original.name}
              <ArrowUpRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity text-wine-neon" />
            </Link>
            <p className="text-xs font-mono text-muted-foreground">{row.original.email}</p>
          </div>
        ),
      },
      {
        id: 'role',
        header: 'Role',
        cell: ({ row }) => (
          <span className="rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-mono">
            {ROLE_LABELS[row.original.role]}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'parent',
        header: 'Reports To',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.parent?.name ?? '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Link
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card/60 px-2.5 py-1 text-xs font-mono text-muted-foreground transition hover:border-wine-neon hover:text-foreground"
              href={`/users/${row.original.id}/edit`}
            >
              <Edit2 size={12} />
              Edit
            </Link>
          </div>
        ),
      },
    ];
    for (const attribute of attributes) {
      base.push({
        id: attribute.key,
        header: attribute.label,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {String(row.original.customData?.[attribute.key] ?? '—')}
          </span>
        ),
      });
    }
    return base;
  }, [attributes]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            Network Users & Agents
            <span className="h-2 w-2 rounded-full bg-wine-neon animate-pulse-dot" />
          </h1>
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            {total} Entities Registered in System
          </p>
        </div>
        <Link
          href="/users/new"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-glow transition hover:bg-primary-light active:scale-[0.98]"
        >
          <Plus size={16} />
          Create User
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Input
          placeholder="Filter by name, email, code…"
          value={q}
          onChange={(event) => {
            setPage(1);
            setQ(event.target.value);
          }}
        />
        <Select
          value={role}
          onChange={(event) => {
            setPage(1);
            setRole(event.target.value);
          }}
        >
          <option value="">Role: All Roles</option>
          <option value="DISTRIBUTOR">Distributor</option>
          <option value="OPERATOR">Operator</option>
          <option value="CUSTOMER">Customer</option>
          <option value="ADMIN">Admin</option>
        </Select>
        <Select
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value);
          }}
        >
          <option value="">Status: All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </Select>
      </div>

      {error ? (
        <div className="rounded-xl border border-danger/60 bg-danger/10 p-4 text-xs font-mono text-danger">
          [ERROR]: {error}
        </div>
      ) : null}

      <DataTable data={rows} columns={columns} />
    </section>
  );
}
