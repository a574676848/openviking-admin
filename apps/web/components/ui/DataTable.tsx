import React, { useMemo, useState } from 'react';
import { ArrowDownUp, ChevronDown, ChevronUp, Search } from "lucide-react";

export interface ColumnDef<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  searchable?: boolean;
  searchValue?: (row: T) => string;
  sortable?: boolean;
  sortValue?: (row: T) => string | number | boolean | Date | null | undefined;
}

type SortDirection = "asc" | "desc";

interface SearchConfig {
  placeholder?: string;
  emptyMessage?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  loading?: boolean;
  emptyMessage?: string;
  loadingMessage?: string;
  errorMessage?: string;
  tableLabel?: string;
  className?: string;
  rowClassName?: (row: T) => string;
  searchConfig?: SearchConfig;
}

const DEFAULT_EMPTY_MESSAGE = "暂无数据";
const DEFAULT_LOADING_MESSAGE = "正在同步数据...";
const DEFAULT_TABLE_LABEL = "数据表格";
const DEFAULT_SEARCH_PLACEHOLDER = "搜索表格内容...";
const DEFAULT_SEARCH_EMPTY_MESSAGE = "没有匹配的结果";

function normalizeSortValue(value: string | number | boolean | Date | null | undefined): string | number {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "number") {
    return value;
  }
  return String(value ?? "").toLowerCase();
}

export function DataTable<T>({
  data,
  columns,
  loading = false,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  loadingMessage = DEFAULT_LOADING_MESSAGE,
  errorMessage,
  tableLabel = DEFAULT_TABLE_LABEL,
  className = "",
  rowClassName,
  searchConfig
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortState, setSortState] = useState<{ key: string; direction: SortDirection } | null>(null);

  const searchableColumns = useMemo(
    () => columns.filter((column) => column.searchable && column.searchValue),
    [columns],
  );

  const filteredData = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword || searchableColumns.length === 0) {
      return data;
    }

    return data.filter((row) =>
      searchableColumns.some((column) => column.searchValue?.(row).toLowerCase().includes(keyword)),
    );
  }, [data, searchQuery, searchableColumns]);

  const visibleData = useMemo(() => {
    if (!sortState) {
      return filteredData;
    }

    const targetColumn = columns.find((column) => column.key === sortState.key);
    if (!targetColumn?.sortable || !targetColumn.sortValue) {
      return filteredData;
    }

    const sortedRows = [...filteredData].sort((left, right) => {
      const leftValue = normalizeSortValue(targetColumn.sortValue?.(left));
      const rightValue = normalizeSortValue(targetColumn.sortValue?.(right));

      if (leftValue < rightValue) {
        return sortState.direction === "asc" ? -1 : 1;
      }
      if (leftValue > rightValue) {
        return sortState.direction === "asc" ? 1 : -1;
      }
      return 0;
    });

    return sortedRows;
  }, [columns, filteredData, sortState]);

  const resolvedEmptyMessage =
    searchConfig && searchQuery.trim() ? (searchConfig.emptyMessage ?? DEFAULT_SEARCH_EMPTY_MESSAGE) : emptyMessage;

  function handleSort(column: ColumnDef<T>) {
    if (!column.sortable || !column.sortValue) {
      return;
    }

    setSortState((current) => {
      if (!current || current.key !== column.key) {
        return { key: column.key, direction: "asc" };
      }
      if (current.direction === "asc") {
        return { key: column.key, direction: "desc" };
      }
      return null;
    });
  }

  return (
    <div
      className={`bg-[var(--bg-card)] border-[var(--border-width)] border-[var(--border)] shadow-[var(--shadow-base)] rounded-[var(--radius-base)] overflow-x-auto hidden-scrollbar ${className}`}
    >
      {searchConfig ? (
        <div className="border-b-[var(--border-width)] border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <label className="relative block">
            <Search
              size={16}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={searchConfig.placeholder ?? DEFAULT_SEARCH_PLACEHOLDER}
              aria-label={`${tableLabel}搜索框`}
              className="w-full border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] py-3 pl-11 pr-4 font-mono text-xs text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--brand)]"
            />
          </label>
        </div>
      ) : null}
      <table className="w-full text-left border-collapse" aria-label={tableLabel} aria-busy={loading}>
        <thead>
          <tr className="bg-[var(--bg-elevated)] border-b border-[var(--border)] font-sans text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {columns.map((col, idx) => (
              <th key={col.key || idx} className={`p-5 ${col.headerClassName ?? ""}`}>
                {col.sortable && col.sortValue ? (
                  <button
                    type="button"
                    onClick={() => handleSort(col)}
                    className="inline-flex items-center gap-2 text-left transition-colors hover:text-[var(--text-primary)]"
                    aria-label={`${col.header}排序`}
                  >
                    <span>{col.header}</span>
                    {sortState?.key === col.key ? (
                      sortState.direction === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    ) : (
                      <ArrowDownUp size={14} />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="p-16 text-center font-sans text-sm font-medium animate-pulse" role="status">
                {loadingMessage}
              </td>
            </tr>
          ) : errorMessage ? (
            <tr>
              <td
                colSpan={columns.length}
                className="p-16 text-center font-sans text-sm font-medium text-[var(--danger)]"
                role="alert"
              >
                {errorMessage}
              </td>
            </tr>
          ) : visibleData.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-16 text-center font-sans text-sm font-medium text-[var(--text-muted)]" role="status">
                {resolvedEmptyMessage}
              </td>
            </tr>
          ) : (
            visibleData.map((row, rIndex) => (
              <tr key={rIndex} className={`border-b border-[var(--border)]/10 last:border-0 hover:bg-[var(--brand-muted)] transition-colors group ${rowClassName ? rowClassName(row) : ''}`}>
                {columns.map((col, cIndex) => (
                  <td key={cIndex} className={`p-5 align-middle ${col.cellClassName ?? ""}`}>
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
