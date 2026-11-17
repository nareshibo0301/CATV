import type { SelectHTMLAttributes } from 'react';

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground ${
        props.className ?? ''
      }`}
    />
  );
}
