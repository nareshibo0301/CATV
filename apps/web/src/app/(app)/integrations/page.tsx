'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';

export default function IntegrationsPage() {
  const [keys, setKeys] = useState<Array<{ id: string; name: string; keyPrefix: string; scopes: string[]; revokedAt: string | null }>>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [endpoints, setEndpoints] = useState<Array<{ id: string; url: string; events: string[]; enabled: boolean }>>([]);
  const [deliveries, setDeliveries] = useState<Array<{ id: string; eventType: string; status: string; attempts: number }>>([]);
  const [me, setMe] = useState('');

  async function load() {
    const [keyResponse, endpointResponse, deliveryResponse, meResponse] = await Promise.all([
      apiFetch('/api/v1/api-keys'),
      apiFetch('/api/v1/webhooks/endpoints'),
      apiFetch('/api/v1/webhooks/deliveries'),
      apiFetch('/api/v1/auth/me'),
    ]);
    if (keyResponse.ok) setKeys((await keyResponse.json()) as typeof keys);
    if (endpointResponse.ok) setEndpoints((await endpointResponse.json()) as typeof endpoints);
    if (deliveryResponse.ok) setDeliveries((await deliveryResponse.json()) as typeof deliveries);
    if (meResponse.ok) setMe(((await meResponse.json()) as { id: string }).id);
  }
  useEffect(() => { void load(); }, []);

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await apiFetch('/api/v1/api-keys', {
      method: 'POST',
      body: JSON.stringify({
        name: String(form.get('name')),
        scopes: ['connections:read', 'connections:write', 'payments:write', 'invoices:read'],
        scopeUserId: me,
        ipAllowlist: [],
        rateLimitPerMinute: 60,
      }),
    });
    if (response.ok) setSecret(((await response.json()) as { secret: string }).secret);
    await load();
  }

  async function createHook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await apiFetch('/api/v1/webhooks/endpoints', {
      method: 'POST',
      body: JSON.stringify({
        url: String(form.get('url')),
        secret: 'catv-webhook-secret-01',
        events: ['connection.published', 'invoice.created', 'payment.received', 'commission.created', 'commission.paid', 'connection.activated', 'connection.free_started', 'connection.free_expired', 'connection.converted_to_paid', 'user.created', 'user.updated'],
      }),
    });
    await load();
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold">Integrations</h1>
      <p className="text-sm text-muted-foreground">OpenAPI lives at <a className="underline" href="/api/docs">/api/docs</a>. Queue board: <a className="underline" href="/api/v1/admin/queues">/api/v1/admin/queues</a>.</p>
      {secret ? <p className="rounded-xl border border-border bg-card p-3 text-sm">Copy this key now. It will not be shown again: {secret}</p> : null}
      <form onSubmit={(event) => void createKey(event)} className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">API keys</h2>
        <Input name="name" placeholder="Key name" required />
        <Button type="submit">Create key</Button>
        <ul className="text-sm">{keys.map((key) => <li key={key.id}>{key.name} · {key.keyPrefix}… · {key.revokedAt ? 'revoked' : key.scopes.join(', ')}</li>)}</ul>
      </form>
      <form onSubmit={(event) => void createHook(event)} className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Outbound webhooks</h2>
        <Input name="url" placeholder="https://example.com/hooks/catv" required />
        <Button type="submit">Register endpoint</Button>
        <Button type="button" onClick={() => void apiFetch('/api/v1/webhooks/test', { method: 'POST' }).then(() => load())}>Send test event</Button>
        <ul className="text-sm">{endpoints.map((endpoint) => <li key={endpoint.id}>{endpoint.url} · {endpoint.enabled ? 'on' : 'off'}</li>)}</ul>
      </form>
      <div className="rounded-2xl border border-border bg-card p-4 text-sm">
        <h2 className="font-semibold">Deliveries</h2>
        <ul>{deliveries.map((delivery) => <li key={delivery.id}>{delivery.eventType} · {delivery.status} · attempts {delivery.attempts}</li>)}</ul>
      </div>
      <p className="text-sm">Example: <code>curl -H "Authorization: Bearer catv_…" -H "Content-Type: application/json" -d "{'{"customerId":"...","planId":"..."}'}" http://localhost:8080/api/v1/connections</code></p>
    </section>
  );
}
