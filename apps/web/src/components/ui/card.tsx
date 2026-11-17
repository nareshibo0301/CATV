import type { HTMLAttributes } from 'react';

export function Card(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`rounded-2xl border border-border bg-card p-6 shadow-glow ${props.className ?? ''}`}
    />
  );
}
