import React from 'react';

export interface ColumnDef<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
  rowClassName?: (row: T) => string;
}

export function DataTable<T>({
  data,
  columns,
  loading = false,
  emptyMessage = "NO DATA",
  className = "",
  rowClassName
}: DataTableProps<T>) {
  return (
    <div className={`bg-[var(--bg-card)] border-[var(--border-width)] border-[var(--border)] shadow-[var(--shadow-base)] overflow-hidden ${className}`}>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-[var(--bg-elevated)] border-b-[var(--border-width)] border-[var(--border)] font-mono text-[10px] font-black uppercase">
            {columns.map((col, idx) => (
              <th key={col.key || idx} className="p-5">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="p-16 text-center font-mono font-black animate-pulse">
                SYNCING...
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-16 text-center font-mono font-bold text-[var(--text-muted)]">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rIndex) => (
              <tr key={rIndex} className={`border-b border-[var(--border)]/10 last:border-0 hover:bg-[var(--brand-muted)] transition-colors group ${rowClassName ? rowClassName(row) : ''}`}>
                {columns.map((col, cIndex) => (
                  <td key={cIndex} className="p-5">
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
