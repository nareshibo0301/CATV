'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import { errorMessage } from '@/lib/http';

export default function PublishConnectionPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; userCode: string | null }>>([]);
  const [plans, setPlans] = useState<Array<{ id: string; name: string }>>([]);
  const [customerId, setCustomerId] = useState('');
  const [planId, setPlanId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch('/api/v1/users?role=CUSTOMER&pageSize=100').then(async (response) => {
      if (response.ok) {
        const body = (await response.json()) as { items: Array<{ id: string; name: string; userCode: string | null }> };
        setCustomers(body.items);
      }
    });
    void apiFetch('/api/v1/plans').then(async (response) => {
      if (response.ok) setPlans((await response.json()) as Array<{ id: string; name: string }>);
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await apiFetch('/api/v1/connections', { method: 'POST', body: JSON.stringify({ customerId, planId }) });
    if (!response.ok) {
      setError(await errorMessage(response));
      return;
    }
    const created = (await response.json()) as { id: string };
    router.push(`/connections/${created.id}`);
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mx-auto max-w-xl space-y-4 rounded-2xl border border-border bg-card p-6">
      <h1 className="text-3xl font-semibold">Publish a connection</h1>
      <div className="space-y-2">
        <Label>Customer</Label>
        <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
          <option value="">Select</option>
          {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.userCode} · {customer.name}</option>)}
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Plan</Label>
        <Select value={planId} onChange={(event) => setPlanId(event.target.value)} required>
          <option value="">Select</option>
          {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
        </Select>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit">Publish as pending</Button>
    </form>
  );
}
