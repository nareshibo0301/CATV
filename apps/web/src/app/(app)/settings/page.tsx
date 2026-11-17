'use client';

import type { Role } from '@catv/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import { errorMessage } from '@/lib/http';

interface AttributeRow {
  id: string;
  key: string;
  label: string;
  dataType: string;
  required: boolean;
  applicableRoles: Role[];
  targetUserId: string | null;
}

export default function SettingsPage() {
  const [padding, setPadding] = useState('5');
  const [prefixes, setPrefixes] = useState({ DISTRIBUTOR: 'DST', OPERATOR: 'OPR', CUSTOMER: 'CUS' });
  const [attributes, setAttributes] = useState<AttributeRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ key: '', label: '', dataType: 'TEXT', options: '', required: false, roles: 'CUSTOMER', targetUserId: '' });

  async function load() {
    const [prefixResponse, attributeResponse] = await Promise.all([
      apiFetch('/api/v1/settings/id-prefixes'),
      apiFetch('/api/v1/attributes'),
    ]);
    if (prefixResponse.ok) {
      const body = (await prefixResponse.json()) as { padding: number; prefixes: typeof prefixes };
      setPadding(String(body.padding));
      setPrefixes({ DISTRIBUTOR: body.prefixes.DISTRIBUTOR, OPERATOR: body.prefixes.OPERATOR, CUSTOMER: body.prefixes.CUSTOMER });
    }
    if (attributeResponse.ok) setAttributes((await attributeResponse.json()) as AttributeRow[]);
  }

  useEffect(() => {
    void load();
  }, []);

  async function savePrefixes(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await apiFetch('/api/v1/settings/id-prefixes', {
      method: 'PUT',
      body: JSON.stringify({ padding: Number(padding), prefixes }),
    });
    if (!response.ok) {
      setError(await errorMessage(response));
      return;
    }
    setMessage('Prefixes saved. Existing user IDs stay the same.');
  }

  async function saveAttribute(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await apiFetch('/api/v1/attributes', {
      method: 'POST',
      body: JSON.stringify({
        key: draft.key,
        label: draft.label,
        dataType: draft.dataType,
        options: draft.dataType === 'SELECT' ? draft.options.split(',').map((item) => item.trim()).filter(Boolean) : undefined,
        required: draft.required,
        applicableRoles: draft.targetUserId ? [] : draft.roles.split(',').map((item) => item.trim()).filter(Boolean),
        targetUserId: draft.targetUserId || null,
      }),
    });
    if (!response.ok) {
      setError(await errorMessage(response));
      return;
    }
    setDraft({ key: '', label: '', dataType: 'TEXT', options: '', required: false, roles: 'CUSTOMER', targetUserId: '' });
    await load();
  }

  async function removeAttribute(id: string) {
    const response = await apiFetch(`/api/v1/attributes/${id}`, { method: 'DELETE' });
    if (!response.ok) setError(await errorMessage(response));
    else await load();
  }

  return (
    <section className="mx-auto max-w-3xl space-y-8">
      <h1 className="text-3xl font-semibold">Settings</h1>
      {message ? <p className="text-sm text-primary-deep dark:text-primary-light">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <form onSubmit={(event) => void savePrefixes(event)} className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">User ID prefixes</h2>
        <p className="text-sm text-muted-foreground">One prefix per category. A change applies only to users created after it.</p>
        {(['DISTRIBUTOR', 'OPERATOR', 'CUSTOMER'] as const).map((role) => (
          <div key={role} className="space-y-2">
            <Label htmlFor={role}>{role}</Label>
            <Input id={role} value={prefixes[role]} onChange={(event) => setPrefixes((current) => ({ ...current, [role]: event.target.value.toUpperCase() }))} />
          </div>
        ))}
        <div className="space-y-2">
          <Label htmlFor="padding">Number padding</Label>
          <Input id="padding" type="number" min={3} max={8} value={padding} onChange={(event) => setPadding(event.target.value)} />
        </div>
        <Button type="submit">Save prefixes</Button>
      </form>
      <form onSubmit={(event) => void saveAttribute(event)} className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">Custom attributes</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder="key" value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value })} required />
          <Input placeholder="Label" value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} required />
          <Select value={draft.dataType} onChange={(event) => setDraft({ ...draft, dataType: event.target.value })}>
            <option value="TEXT">Text</option>
            <option value="NUMBER">Number</option>
            <option value="DATE">Date</option>
            <option value="BOOLEAN">Boolean</option>
            <option value="SELECT">Select</option>
          </Select>
          <Input placeholder="Roles, comma separated" value={draft.roles} onChange={(event) => setDraft({ ...draft, roles: event.target.value })} />
          <Input placeholder="Select options, comma separated" value={draft.options} onChange={(event) => setDraft({ ...draft, options: event.target.value })} />
          <Input placeholder="Limit to user id (optional)" value={draft.targetUserId} onChange={(event) => setDraft({ ...draft, targetUserId: event.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.required} onChange={(event) => setDraft({ ...draft, required: event.target.checked })} />
          Required
        </label>
        <Button type="submit">Add attribute</Button>
        <ul className="space-y-2 text-sm">
          {attributes.map((attribute) => (
            <li key={attribute.id} className="flex items-center justify-between gap-3 border-t border-border pt-2">
              <span>{attribute.label} ({attribute.key}) · {attribute.dataType}{attribute.targetUserId ? ' · one user' : ` · ${attribute.applicableRoles.join(', ')}`}</span>
              <Button variant="ghost" onClick={() => void removeAttribute(attribute.id)}>Delete</Button>
            </li>
          ))}
        </ul>
      </form>
    </section>
  );
}
