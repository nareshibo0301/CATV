'use client';

import type { Role } from '@catv/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import { errorMessage } from '@/lib/http';

interface Me {
  id: string;
  role: Role;
}

interface OptionUser {
  id: string;
  name: string;
  userCode: string | null;
  role: Role;
}

interface AttributeField {
  key: string;
  label: string;
  dataType: 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'SELECT';
  options: string[];
  required: boolean;
}

export default function NewUserPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [role, setRole] = useState<'DISTRIBUTOR' | 'OPERATOR' | 'CUSTOMER'>('CUSTOMER');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [parentId, setParentId] = useState('');
  const [parents, setParents] = useState<OptionUser[]>([]);
  const [attributes, setAttributes] = useState<AttributeField[]>([]);
  const [customData, setCustomData] = useState<Record<string, string | boolean>>({});
  const [commissionType, setCommissionType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [commissionValue, setCommissionValue] = useState('10');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void apiFetch('/api/v1/auth/me').then(async (response) => {
      if (response.ok) setMe((await response.json()) as Me);
    });
  }, []);

  const roleChoices: Array<'DISTRIBUTOR' | 'OPERATOR' | 'CUSTOMER'> =
    me?.role === 'ADMIN'
      ? ['DISTRIBUTOR', 'OPERATOR', 'CUSTOMER']
      : me?.role === 'DISTRIBUTOR'
        ? ['OPERATOR', 'CUSTOMER']
        : ['CUSTOMER'];

  useEffect(() => {
    if (!roleChoices.includes(role)) setRole(roleChoices[0] ?? 'CUSTOMER');
    // roleChoices is derived from me on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, role]);

  const parentIsDistributor = parents.find((parent) => parent.id === parentId)?.role === 'DISTRIBUTOR';
  const commissionRequired = me?.role === 'ADMIN' && (role === 'DISTRIBUTOR' || (role === 'OPERATOR' && (parentId ? parentIsDistributor : false)));

  useEffect(() => {
    if (me?.role !== 'ADMIN' && me?.role !== 'DISTRIBUTOR') return;
    if (role === 'DISTRIBUTOR') {
      setParents([]);
      return;
    }
    const query = role === 'OPERATOR' ? 'pageSize=100&role=DISTRIBUTOR' : 'pageSize=100';
    void apiFetch(`/api/v1/users?${query}`).then(async (response) => {
      if (!response.ok) return;
      const body = (await response.json()) as { items: OptionUser[] };
      const items = role === 'CUSTOMER' ? body.items.filter((item) => item.role === 'DISTRIBUTOR' || item.role === 'OPERATOR') : body.items;
      setParents(items);
    });
  }, [me, role]);

  useEffect(() => {
    if (me?.role !== 'ADMIN') return;
    void apiFetch(`/api/v1/attributes?role=${role}`).then(async (response) => {
      if (!response.ok) return;
      setAttributes((await response.json()) as AttributeField[]);
    });
  }, [me, role]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const payload: Record<string, unknown> = { role, name, email, phone, password };
    if (role !== 'DISTRIBUTOR') payload.parentId = parentId || undefined;
    if (me?.role === 'ADMIN' && attributes.length > 0) {
      const data: Record<string, unknown> = {};
      for (const attribute of attributes) {
        const value = customData[attribute.key];
        if (attribute.dataType === 'BOOLEAN') data[attribute.key] = Boolean(value);
        else if (attribute.dataType === 'NUMBER' && value !== undefined && value !== '') data[attribute.key] = Number(value);
        else if (value !== undefined && value !== '') data[attribute.key] = value;
      }
      payload.customData = data;
    }
    if (commissionRequired) {
      payload.commission = { type: commissionType, value: Number(commissionValue) };
    }
    const response = await apiFetch('/api/v1/users', { method: 'POST', body: JSON.stringify(payload) });
    setPending(false);
    if (!response.ok) {
      setError(await errorMessage(response));
      return;
    }
    const created = (await response.json()) as { id: string };
    router.push(`/users/${created.id}`);
  }

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-semibold">New user</h1>
      <form onSubmit={(event) => void submit(event)} className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <Select id="role" value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
            {roleChoices.map((choice) => (
              <option key={choice} value={choice}>{choice}</option>
            ))}
          </Select>
        </div>
        {role !== 'DISTRIBUTOR' && me?.role === 'ADMIN' ? (
          <div className="space-y-2">
            <Label htmlFor="parent">Belongs to</Label>
            <Select id="parent" value={parentId} onChange={(event) => setParentId(event.target.value)} required>
              <option value="">{role === 'OPERATOR' ? 'Directly under me' : 'Select'}</option>
              {parents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.userCode ? `${parent.userCode} · ` : ''}{parent.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        {role === 'CUSTOMER' && me?.role === 'DISTRIBUTOR' ? (
          <div className="space-y-2">
            <Label htmlFor="parent">Belongs to</Label>
            <Select id="parent" value={parentId} onChange={(event) => setParentId(event.target.value)}>
              <option value="">Directly under me</option>
              {parents.filter((parent) => parent.role === 'OPERATOR').map((parent) => (
                <option key={parent.id} value={parent.id}>{parent.userCode} · {parent.name}</option>
              ))}
            </Select>
          </div>
        ) : null}
        <Field id="name" label="Name" value={name} onChange={setName} />
        <Field id="email" label="Email" type="email" value={email} onChange={setEmail} />
        <Field id="phone" label="Phone" value={phone} onChange={setPhone} />
        <Field id="password" label="Password" type="password" value={password} onChange={setPassword} />
        {commissionRequired ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Commission type</Label>
              <Select value={commissionType} onChange={(event) => setCommissionType(event.target.value as 'PERCENTAGE' | 'FIXED')}>
                <option value="PERCENTAGE">Percentage</option>
                <option value="FIXED">Fixed amount</option>
              </Select>
            </div>
            <Field id="commission" label="Commission value" value={commissionValue} onChange={setCommissionValue} />
          </div>
        ) : null}
        {me?.role === 'ADMIN'
          ? attributes.map((attribute) => (
              <AttributeInput
                key={attribute.key}
                attribute={attribute}
                value={customData[attribute.key]}
                onChange={(value) => setCustomData((current) => ({ ...current, [attribute.key]: value }))}
              />
            ))
          : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Create user'}</Button>
      </form>
    </section>
  );
}

function Field({ id, label, value, onChange, type = 'text' }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} required={id !== 'phone'} />
    </div>
  );
}

function AttributeInput({ attribute, value, onChange }: { attribute: AttributeField; value: string | boolean | undefined; onChange: (value: string | boolean) => void }) {
  if (attribute.dataType === 'BOOLEAN') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        {attribute.label}
      </label>
    );
  }
  if (attribute.dataType === 'SELECT') {
    return (
      <div className="space-y-2">
        <Label>{attribute.label}</Label>
        <Select value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select</option>
          {attribute.options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </Select>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Label>{attribute.label}</Label>
      <Input
        type={attribute.dataType === 'NUMBER' ? 'number' : attribute.dataType === 'DATE' ? 'date' : 'text'}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        required={attribute.required}
      />
    </div>
  );
}
