'use client';

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useState } from 'react';

export function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();

  let colorClasses = 'border-border bg-muted text-muted-foreground';

  if (s.includes('PAID') || s === 'ACTIVE') {
    colorClasses = 'border-emerald-700/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  } else if (s.includes('FREE')) {
    colorClasses = 'border-sky-700/50 bg-sky-500/10 text-sky-600 dark:text-sky-400';
  } else if (s.includes('PENDING') || s.includes('PARTIAL') || s === 'ISSUED') {
    colorClasses = 'border-amber-700/50 bg-amber-500/10 text-amber-600 dark:text-amber-400';
  } else if (s.includes('SUSPEND') || s.includes('DISCONNECT') || s.includes('OVERDUE')) {
    colorClasses = 'border-danger/50 bg-danger/10 text-danger';
  }

  const label = status.replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide ${colorClasses}`}
    >
      {label}
    </span>
  );
}

export function DataTable<T>({
  columns,
  data,
  searchPlaceholder = 'Filter records…',
  pageSize = 15,
}: {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  searchPlaceholder?: string;
  pageSize?: number;
}) {
  const [filter, setFilter] = useState('');

  const filteredData = filter
    ? data.filter((row) =>
        JSON.stringify(row).toLowerCase().includes(filter.toLowerCase()),
      )
    : data;

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize,
      },
    },
  });

  return (
    <div className="space-y-3">
      {data.length > 5 && (
        <div className="flex items-center justify-between gap-4">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-4 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {filteredData.length} records
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-glow">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id} className="border-b border-border bg-muted">
                  {group.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-muted-foreground" colSpan={columns.length}>
                    Nothing to show.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-muted/40"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 align-middle text-foreground">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {table.getPageCount() > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <span>
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 font-medium transition hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <button
                type="button"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 font-medium transition hover:bg-muted disabled:opacity-40"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
