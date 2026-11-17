'use client';

import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Cable,
  CheckCircle2,
  Clock,
  DollarSign,
  Filter,
  PieChart as PieIcon,
  Plus,
  Radio,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { GoldChart } from '@/components/gold-chart';
import { Card } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';

interface DashboardData {
  kpis: Record<string, number>;
  funnel: Array<{ name: string; value: number }>;
  revenueTrend: Array<{ date: string; amount: number }>;
  collectionVsOutstanding: { collected: number; outstanding: number };
  statusDistribution: Array<{ name: string; value: number }>;
  conversionRate: number;
  churn: number;
}

const KPI_META: Record<
  string,
  { label: string; icon: typeof Cable; trend?: string; trendUp?: boolean }
> = {
  total: { label: 'Total Connections', icon: Cable, trend: '+12.4%', trendUp: true },
  pending: { label: 'Pending Drops', icon: Clock, trend: '-2.1%', trendUp: false },
  activePaid: { label: 'Active Paid Nodes', icon: Zap, trend: '+8.6%', trendUp: true },
  activeFree: { label: 'Active Free Trials', icon: Sparkles, trend: '+5.0%', trendUp: true },
  expiring7: { label: 'Expiring in 7 Days', icon: AlertTriangle },
  expiring30: { label: 'Expiring in 30 Days', icon: Clock },
  revenueToday: { label: "Today's Revenue", icon: DollarSign, trend: '+18.2%', trendUp: true },
  revenueMonth: { label: 'Month Revenue', icon: Wallet, trend: '+24.5%', trendUp: true },
  outstanding: { label: 'Outstanding Dues', icon: AlertTriangle, trend: '-4.3%', trendUp: true },
  commissionPayable: { label: 'Payable Commission', icon: Users },
};

const SAMPLE_MOVEMENTS = [
  { id: 1, type: 'ACTIVATION', text: 'Connection #C-0482 activated under Operator North', time: '2m ago' },
  { id: 2, type: 'PAYMENT', text: '₹352.82 collected via UPI for Invoice #INV-0019', time: '14m ago' },
  { id: 3, type: 'OFFER', text: 'Customer #C-0109 upgraded to Premium Cable package', time: '41m ago' },
  { id: 4, type: 'COMMISSION', text: '₹450 commission ledger credited to South Distributor', time: '1h ago' },
  { id: 5, type: 'DISPATCH', text: 'Drop cable installation completed for Zone North Sector 4', time: '2h ago' },
];

export function DashboardView({ name }: { name: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [timeframe, setTimeframe] = useState<'24H' | '7D' | '30D' | '90D'>('30D');
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    setRefreshing(true);
    try {
      const response = await apiFetch('/api/v1/reports/dashboard');
      if (response.ok) {
        setData((await response.json()) as DashboardData);
      }
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-primary-deep dark:text-primary-light">Overview</p>
          <h1 className="mt-1 text-3xl font-semibold">Welcome, {name}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-border bg-card p-1">
            {(['24H', '7D', '30D', '90D'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTimeframe(t)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  timeframe === t
                    ? 'bg-primary text-[var(--on-primary)] shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition hover:text-foreground"
            title="Refresh Dashboard"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>

          <Link
            href="/connections/new"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-[var(--on-primary)] transition hover:bg-primary-deep"
          >
            <Plus size={15} />
            Publish connection
          </Link>
        </div>
      </div>

      {!data ? (
        <p className="text-sm text-muted-foreground">Loading the network telemetry…</p>
      ) : (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
            {Object.entries(data.kpis).map(([key, value]) => {
              const meta = KPI_META[key] ?? {
                label: key,
                icon: Activity,
              };
              const Icon = meta.icon;
              const isMoney = key.toLowerCase().includes('revenue') || key.toLowerCase().includes('outstanding') || key.toLowerCase().includes('payable');

              return (
                <Card key={key} className="transition hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {meta.label}
                    </span>
                    <div className="rounded-lg border border-border p-1.5 text-muted-foreground">
                      <Icon size={14} />
                    </div>
                  </div>

                  <div className="mt-2 flex items-baseline justify-between">
                    <p className="text-2xl font-semibold">
                      {isMoney ? `₹${Number(value).toLocaleString()}` : value}
                    </p>
                    {meta.trend && (
                      <span
                        className={`inline-flex items-center text-xs font-medium ${
                          meta.trendUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-danger'
                        }`}
                      >
                        {meta.trendUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {meta.trend}
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <h2 className="mb-2 font-semibold">Revenue movement trend</h2>
              <GoldChart
                className="h-80 w-full"
                option={{
                  tooltip: { trigger: 'axis', formatter: '{b}: ₹{c}' },
                  xAxis: {
                    type: 'category',
                    data: data.revenueTrend.map((point) => point.date),
                  },
                  yAxis: { type: 'value' },
                  series: [
                    {
                      type: 'line',
                      data: data.revenueTrend.map((point) => point.amount),
                      smooth: true,
                    },
                  ],
                }}
              />
            </Card>

            <Card>
              <h2 className="mb-2 font-semibold">Connection status distribution</h2>
              <GoldChart
                className="h-80 w-full"
                option={{
                  tooltip: { trigger: 'item' },
                  series: [
                    {
                      type: 'pie',
                      radius: ['45%', '70%'],
                      data: data.statusDistribution,
                    },
                  ],
                }}
              />
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card>
              <h2 className="mb-2 font-semibold">Activation funnel</h2>
              <GoldChart
                className="h-64 w-full"
                option={{
                  series: [
                    {
                      type: 'funnel',
                      data: data.funnel,
                      label: { color: 'inherit' },
                    },
                  ],
                }}
              />
            </Card>

            <Card>
              <h2 className="mb-2 font-semibold">Collected vs Outstanding</h2>
              <GoldChart
                className="h-64 w-full"
                option={{
                  xAxis: { type: 'category', data: ['Collected', 'Outstanding'] },
                  yAxis: { type: 'value' },
                  series: [
                    {
                      type: 'bar',
                      data: [data.collectionVsOutstanding.collected, data.collectionVsOutstanding.outstanding],
                    },
                  ],
                }}
              />
              <p className="mt-2 text-sm text-muted-foreground">
                Free-to-paid conversion {data.conversionRate}% · churn {data.churn}%
              </p>
            </Card>

            <Card className="flex flex-col justify-between">
              <div>
                <h2 className="mb-3 font-semibold flex items-center gap-2">
                  <Radio size={16} className="text-primary-deep dark:text-primary-light" />
                  Live movement stream
                </h2>
                <div className="space-y-2.5">
                  {SAMPLE_MOVEMENTS.map((mov) => (
                    <div
                      key={mov.id}
                      className="rounded-xl border border-border p-2.5 text-xs transition hover:bg-muted/40"
                    >
                      <p className="font-medium text-foreground truncate">{mov.text}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{mov.time}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-border">
                <Link
                  href="/reports"
                  className="text-xs font-medium text-primary-deep dark:text-primary-light hover:underline"
                >
                  View all movement reports →
                </Link>
              </div>
            </Card>
          </div>
        </>
      )}
    </section>
  );
}
