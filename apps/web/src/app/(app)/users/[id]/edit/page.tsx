'use client';

import type { Role } from '@catv/shared';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Lock, Mail, Phone, Save, Shield, User } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import { errorMessage } from '@/lib/http';

interface Me {
  role: Role;
}
interface AttributeField {
  key: string;
  label: string;
  dataType: 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'SELECT';
  options: string[];
  required: boolean;
}

export default function EditUserPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('CUSTOMER');
  const [attributes, setAttributes] = useState<AttributeField[]>([]);
  const [customData, setCustomData] = useState<Record<string, string | boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [meResponse, userResponse] = await Promise.all([
          apiFetch('/api/v1/auth/me'),
          apiFetch(`/api/v1/users/${params.id}`),
        ]);
        const current = meResponse.ok ? ((await meResponse.json()) as Me) : null;
        if (current) setMe(current);

        if (!userResponse.ok) {
          setError(await errorMessage(userResponse));
          return;
        }

        const user = (await userResponse.json()) as {
          name: string;
          email: string;
          phone: string | null;
          role: Role;
          customData?: Record<string, unknown> | null;
        };

        setName(user.name || '');
        setEmail(user.email || '');
        setPhone(user.phone ?? '');
        setRole(user.role);

        // Safe fallback for customData to prevent crash!
        const next: Record<string, string | boolean> = {};
        if (user.customData && typeof user.customData === 'object') {
          for (const [key, value] of Object.entries(user.customData)) {
            next[key] = typeof value === 'boolean' ? value : String(value ?? '');
          }
        }
        setCustomData(next);

        if (current?.role === 'ADMIN') {
          const attributesResponse = await apiFetch(`/api/v1/attributes?role=${user.role}&userId=${params.id}`);
          if (attributesResponse.ok) setAttributes((await attributesResponse.json()) as AttributeField[]);
        }
      } catch (e) {
        setError('Failed to load user profile information.');
      }
    })();
  }, [params.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    setSaved(false);

    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() ? phone.trim() : null,
      };

      if (password) {
        if (password.length < 10) {
          setError('New password must be at least 10 characters.');
          setSaving(false);
          return;
        }
        payload.password = password;
      }

      if (me?.role === 'ADMIN') {
        const data: Record<string, unknown> = {};
        for (const attribute of attributes) {
          const value = customData[attribute.key];
          if (attribute.dataType === 'BOOLEAN') data[attribute.key] = Boolean(value);
          else if (attribute.dataType === 'NUMBER' && value !== undefined && value !== '') data[attribute.key] = Number(value);
          else if (value !== undefined && value !== '') data[attribute.key] = value;
        }
        payload.customData = data;
      }

      const response = await apiFetch(`/api/v1/users/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError(await errorMessage(response));
        setSaving(false);
        return;
      }

      setSaved(true);
      setTimeout(() => {
        router.push(`/users/${params.id}`);
      }, 700);
    } catch {
      setError('Network communication failed during update.');
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/users/${params.id}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card/60 text-muted-foreground transition hover:border-wine-neon hover:text-foreground"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Edit Node Profile
            <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs font-mono text-muted-foreground">
              {role}
            </span>
          </h1>
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Identity & Network Node Attributes
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-danger/60 bg-danger/10 p-4 text-xs font-mono text-danger">
          [ERROR]: {error}
        </div>
      ) : null}

      {saved ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-800 bg-emerald-950/40 p-4 text-xs font-mono text-emerald-300">
          <Check size={16} /> PROFILE UPDATED SUCCESSFULLY. REDIRECTING...
        </div>
      ) : null}

      <form onSubmit={(event) => void submit(event)} className="space-y-5 rounded-2xl border border-border bg-card/85 p-6 backdrop-blur-md shadow-glow-subtle">
        <div className="space-y-2">
          <Label htmlFor="name" className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <User size={14} className="text-wine-neon" /> FULL NAME
          </Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Node display name" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <Mail size={14} className="text-wine-neon" /> EMAIL ADDRESS
          </Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="user@node.local" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <Phone size={14} className="text-wine-neon" /> PHONE CONTACT
          </Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
        </div>

        <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-4">
          <Label htmlFor="password" className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <Lock size={14} className="text-wine-neon" /> NEW PASSWORD
          </Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank to preserve current password"
          />
          <p className="text-[11px] font-mono text-muted-foreground/80">
            Minimum 10 chars, at least one letter and one number if changing.
          </p>
        </div>

        {me?.role === 'ADMIN' && attributes.length > 0 ? (
          <div className="space-y-4 border-t border-border pt-4">
            <h2 className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
              <Shield size={14} className="text-wine-neon" /> Custom Network Attributes
            </h2>
            {attributes.map((attribute) => (
              <div key={attribute.key} className="space-y-2">
                <Label className="text-xs font-mono text-muted-foreground">{attribute.label}</Label>
                {attribute.dataType === 'BOOLEAN' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={attribute.key}
                      checked={Boolean(customData[attribute.key])}
                      onChange={(event) =>
                        setCustomData((current) => ({ ...current, [attribute.key]: event.target.checked }))
                      }
                      className="h-4 w-4 rounded border-border bg-card text-primary focus:ring-wine-neon"
                    />
                    <label htmlFor={attribute.key} className="text-xs font-mono text-muted-foreground cursor-pointer">
                      Enabled
                    </label>
                  </div>
                ) : attribute.dataType === 'SELECT' ? (
                  <Select
                    value={String(customData[attribute.key] ?? '')}
                    onChange={(event) =>
                      setCustomData((current) => ({ ...current, [attribute.key]: event.target.value }))
                    }
                  >
                    <option value="">Select option</option>
                    {attribute.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    type={attribute.dataType === 'NUMBER' ? 'number' : 'text'}
                    value={String(customData[attribute.key] ?? '')}
                    onChange={(event) =>
                      setCustomData((current) => ({ ...current, [attribute.key]: event.target.value }))
                    }
                    placeholder={`Enter ${attribute.label.toLowerCase()}`}
                  />
                )}
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-3 pt-3">
          <Link
            href={`/users/${params.id}`}
            className="rounded-xl border border-border px-4 py-2.5 text-xs font-mono uppercase text-muted-foreground transition hover:border-border-light hover:text-foreground"
          >
            Cancel
          </Link>
          <Button type="submit" disabled={saving}>
            <Save size={16} />
            {saving ? 'Saving changes…' : 'Save profile'}
          </Button>
        </div>
      </form>
    </section>
  );
}
