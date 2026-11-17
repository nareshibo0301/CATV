'use client';

import { useEffect, useState, useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  Calendar,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FileText,
  Layers,
  Radio,
  Receipt,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Table,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { DataTable, StatusBadge } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';

interface ReportTypeMeta {
  id: string;
  label: string;
  description: string;
  icon: typeof Table;
  badge: string;
}

const REPORT_TYPES: ReportTypeMeta[] = [
  {
    id: 'connections',
    label: 'Connection Drops',
    description: 'Subscriber line allocations, plant nodes & drops',
    icon: Radio,
    badge: 'Network',
  },
  {
    id: 'activations',
    label: 'Activation Transitions',
    description: 'Historical status changes (Pending → Paid / Free)',
    icon: Zap,
    badge: 'Movement',
  },
  {
    id: 'free-periods',
    label: 'Free Trial Windows',
    description: 'Trial offers, expiration countdowns & conversions',
    icon: Clock,
    badge: 'Lifecycle',
  },
  {
    id: 'invoices',
    label: 'Billing & Invoices',
    description: 'Monthly dues, charges, taxes & generated notes',
    icon: Receipt,
    badge: 'Finance',
  },
  {
    id: 'payments',
    label: 'Collections Stream',
    description: 'Cash, UPI, and online receipts logged in system',
    icon: Wallet,
    badge: 'Liquidity',
  },
  {
    id: 'outstanding',
    label: 'Outstanding Dues',
    description: 'Uncollected balances and overdue accounts',
    icon: AlertTriangle,
    badge: 'Recovery',
  },
  {
    id: 'commissions',
    label: 'Operator Commissions',
    description: 'Ledger allocations for distributors and operators',
    icon: Activity,
    badge: 'Ledger',
  },
  {
    id: 'payouts',
    label: 'Payout Settlements',
    description: 'Disbursements and bank payments to partners',
    icon: CheckCircle2,
    badge: 'Disbursement',
  },
  {
    id: 'users',
    label: 'Subscriber Census',
    description: 'Profiles, zones, contacts, and roles registered',
    icon: Users,
    badge: 'Directory',
  },
  {
    id: 'audit',
    label: 'Audit Security Log',
    description: 'Every system mutation, IP address, and actor trace',
    icon: Layers,
    badge: 'Security',
  },
];

export default function ReportsHubPage() {
  const [activeReport, setActiveReport] = useState<string>('connections');
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Custom Report Builder Controls
  const [showBuilder, setShowBuilder] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  async function fetchReport(reportId: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const response = await apiFetch(`/api/v1/reports/${reportId}${qs}`);
      if (!response.ok) return;

      const body = (await response.json()) as { columns: string[]; rows: string[][]; total: number };
      setColumns(body.columns);
      setSelectedColumns(body.columns);
      setRows(body.rows);
      setTotal(body.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchReport(activeReport);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReport, fromDate, toDate]);

  function exportReport(format: 'csv' | 'xlsx' | 'pdf') {
    const params = new URLSearchParams({ format });
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    window.location.href = `/api/v1/reports/${activeReport}/export?${params.toString()}`;
  }

  function toggleColumn(col: string) {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
    );
  }

  // Filtered rows by client search
  const displayedRows = useMemo(() => {
    if (!filterQuery.trim()) return rows;
    const q = filterQuery.toLowerCase();
    return rows.filter((r) => r.some((cell) => String(cell).toLowerCase().includes(q)));
  }, [rows, filterQuery]);

  // Dynamic Column definitions
  const tableColumns = useMemo<ColumnDef<string[], unknown>[]>(() => {
    return columns
      .filter((col) => selectedColumns.includes(col))
      .map((column) => {
        const colIndex = columns.indexOf(column);
        return {
          id: column,
          header: column.replace(/_/g, ' '),
          cell: ({ row }) => {
            const val = String(row.original[colIndex] ?? '—');
            // If the cell contains an enum status, format with StatusBadge
            if (
              column.toLowerCase().includes('status') ||
              val === 'ACTIVE' ||
              val === 'SUSPENDED' ||
              val === 'PAID' ||
              val === 'PENDING'
            ) {
              return <StatusBadge status={val} />;
            }
            if (val.startsWith('₹') || column.toLowerCase().includes('amount') || column.toLowerCase().includes('total')) {
              return <span className="font-mono font-semibold text-foreground">{val}</span>;
            }
            return <span className="text-xs">{val}</span>;
          },
        };
      });
  }, [columns, selectedColumns]);

  const activeMeta = REPORT_TYPES.find((r) => r.id === activeReport) ?? (REPORT_TYPES[0] as ReportTypeMeta);

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            Network Movement & Custom Reports
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          </h1>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Multi-Movement Ledger & Forensic Telemetry Analysis
          </p>
        </div>

        {/* Global Export Hub */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowBuilder(!showBuilder)}
            className={`text-xs ${showBuilder ? 'border-primary text-primary-deep dark:text-primary-light' : ''}`}
          >
            <SlidersHorizontal size={14} />
            Custom Builder
          </Button>

          <div className="flex items-center rounded-xl border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => exportReport('csv')}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
              title="Export Comma Separated Values"
            >
              <FileText size={14} />
              CSV
            </button>
            <button
              type="button"
              onClick={() => exportReport('xlsx')}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
              title="Export Microsoft Excel Spreadsheet"
            >
              <FileSpreadsheet size={14} />
              Excel
            </button>
            <button
              type="button"
              onClick={() => exportReport('pdf')}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
              title="Export Formatted PDF Document"
            >
              <ArrowDownToLine size={14} />
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* Movement Report Selector Grid */}
      <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-5">
        {REPORT_TYPES.map((rep) => {
          const Icon = rep.icon;
          const isSelected = activeReport === rep.id;
          return (
            <button
              key={rep.id}
              type="button"
              onClick={() => setActiveReport(rep.id)}
              className={`flex flex-col items-start rounded-2xl border p-3.5 text-left transition ${
                isSelected
                  ? 'border-primary bg-primary/10 shadow-sm'
                  : 'border-border bg-card hover:bg-muted/40'
              }`}
            >
              <div className="flex w-full items-center justify-between mb-2">
                <div
                  className={`rounded-xl p-2 ${
                    isSelected ? 'bg-primary text-[var(--on-primary)]' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon size={16} />
                </div>
                <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                  {rep.badge}
                </span>
              </div>
              <p className="font-semibold text-xs tracking-tight text-foreground truncate w-full">
                {rep.label}
              </p>
              <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                {rep.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Custom Report Builder Drawer */}
      {showBuilder && (
        <Card className="animate-rise">
          <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
            <h2 className="font-semibold text-foreground flex items-center gap-2 text-sm uppercase tracking-wider">
              <SlidersHorizontal size={16} />
              Custom Report Parameters
            </h2>
            <button
              type="button"
              onClick={() => {
                setFromDate('');
                setToDate('');
                setSelectedColumns(columns);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Reset
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Calendar size={13} /> DATE RANGE FROM
              </label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Calendar size={13} /> DATE RANGE TO
              </label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Search size={13} /> TEXT FILTER
              </label>
              <Input
                placeholder="Search across attributes…"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          {/* Column Visibility Selector */}
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Visible Columns ({selectedColumns.length}/{columns.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {columns.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => toggleColumn(col)}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                    selectedColumns.includes(col)
                      ? 'border-primary bg-primary/10 text-primary-deep dark:text-primary-light font-medium'
                      : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  {col}
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Telemetry Scope Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-foreground text-sm flex items-center gap-2">
            {activeMeta?.label ?? 'Connections'}
          </span>
          <span className="text-xs text-muted-foreground">
            {displayedRows.length} records of {total} total
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchReport(activeReport)}
            className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Main Table */}
      {loading ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Loading {activeMeta?.label}…</p>
      ) : (
        <DataTable
          data={displayedRows}
          columns={tableColumns}
          searchPlaceholder={`Filter ${(activeMeta?.label ?? 'Records').toLowerCase()}…`}
          pageSize={20}
        />
      )}
    </section>
  );
}
