import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="animate-rise w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="gold-gradient inline-flex h-12 w-12 items-center justify-center rounded-xl text-xl font-bold text-[var(--on-primary)]">
            C
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">CATV</h1>
            <p className="text-sm text-muted-foreground">Sign in to the cable network</p>
          </div>
        </div>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading sign-in…</p>}>
          <LoginForm />
        </Suspense>
      </Card>
    </main>
  );
}
