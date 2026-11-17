'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Check, Edit2, Plus, Shield, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import { errorMessage } from '@/lib/http';

interface Plan {
  id: string;
  name: string;
  price: string;
  billingCycle: string;
  taxPercent: string;
}

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [name, setName] = useState('Basic cable');
  const [price, setPrice] = useState('299');
  const [billingCycle, setBillingCycle] = useState('MONTHLY');
  const [taxPercent, setTaxPercent] = useState('18');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const response = await apiFetch('/api/v1/plans');
    if (response.ok) setPlans((await response.json()) as Plan[]);
  }

  useEffect(() => {
    void load();
  }, []);

  function startEdit(plan: Plan) {
    setEditingPlanId(plan.id);
    setName(plan.name);
    setPrice(plan.price);
    setBillingCycle(plan.billingCycle);
    setTaxPercent(plan.taxPercent);
    setError(null);
  }

  function cancelEdit() {
    setEditingPlanId(null);
    setName('Basic cable');
    setPrice('299');
    setBillingCycle('MONTHLY');
    setTaxPercent('18');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const url = editingPlanId ? `/api/v1/plans/${editingPlanId}` : '/api/v1/plans';
      const method = editingPlanId ? 'PATCH' : 'POST';

      const response = await apiFetch(url, {
        method,
        body: JSON.stringify({
          name,
          price: Number(price),
          billingCycle,
          taxPercent: Number(taxPercent),
          active: true,
        }),
      });

      if (!response.ok) {
        setError(await errorMessage(response));
        setSubmitting(false);
        return;
      }

      cancelEdit();
      await load();
    } catch {
      setError('Failed to save subscription plan.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Subscription Plans
            <span className="h-2 w-2 rounded-full bg-wine-neon animate-pulse-dot" />
          </h1>
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Tariff Packages & Pricing Matrix
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-danger/60 bg-danger/10 p-4 text-xs font-mono text-danger">
          [ERROR]: {error}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-3">
        {/* Active Plans Cards */}
        <div className="space-y-3 md:col-span-2">
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Active Packages ({plans.length})
          </h2>
          <div className="grid gap-3">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="group flex items-center justify-between rounded-2xl border border-border bg-card/85 p-5 backdrop-blur-md transition-all duration-200 hover:border-border-light hover:shadow-glow-subtle"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-base">{plan.name}</span>
                    <span className="rounded-full border border-wine-dark/70 bg-wine-dark/20 px-2 py-0.5 text-[10px] font-mono uppercase text-wine-neon">
                      {plan.billingCycle}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-muted-foreground">
                    Tax Rate: <span className="text-foreground">{plan.taxPercent}%</span>
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xl font-bold font-mono text-foreground">₹{plan.price}</p>
                    <p className="text-[10px] font-mono uppercase text-muted-foreground">Base Price</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(plan)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card/60 text-muted-foreground transition hover:border-wine-neon hover:text-foreground"
                    title="Edit Plan"
                  >
                    <Edit2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Create / Edit Plan Form */}
        <div>
          <Card className="border-border-light bg-card/90">
            <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4">
              <Shield size={16} className="text-wine-neon" />
              {editingPlanId ? 'Edit Plan' : 'Create New Plan'}
            </h2>
            <form onSubmit={(e) => void submit(e)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="plan-name" className="text-xs font-mono text-muted-foreground">
                  PLAN NAME
                </Label>
                <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="plan-price" className="text-xs font-mono text-muted-foreground">
                  MONTHLY PRICE (₹)
                </Label>
                <Input id="plan-price" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="plan-cycle" className="text-xs font-mono text-muted-foreground">
                  BILLING CYCLE
                </Label>
                <Select id="plan-cycle" value={billingCycle} onChange={(e) => setBillingCycle(e.target.value)}>
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="YEARLY">Yearly</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="plan-tax" className="text-xs font-mono text-muted-foreground">
                  TAX PERCENT (%)
                </Label>
                <Input id="plan-tax" type="number" step="0.1" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} required />
              </div>

              <div className="flex items-center gap-2 pt-2">
                {editingPlanId && (
                  <Button type="button" variant="outline" onClick={cancelEdit} className="w-1/2">
                    <X size={15} /> Cancel
                  </Button>
                )}
                <Button type="submit" disabled={submitting} className={editingPlanId ? 'w-1/2' : 'w-full'}>
                  {editingPlanId ? <Check size={15} /> : <Plus size={15} />}
                  {submitting ? 'Saving…' : editingPlanId ? 'Update' : 'Create Plan'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </section>
  );
}
