import Link from 'next/link';
import { Card } from '@/components/ui/card';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="max-w-md text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary-deep dark:text-primary-light">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <Link href="/dashboard" className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-[var(--on-primary)]">
          Back to dashboard
        </Link>
      </Card>
    </main>
  );
}
