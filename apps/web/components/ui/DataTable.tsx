import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search } from "lucide-react";

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

interface PaginationConfig {
  enabled?: boolean;
  pageSize?: number;
  pageSizeOptions?: number[];
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
  paginationConfig?: PaginationConfig;
}

const DEFAULT_EMPTY_MESSAGE = "暂无数据";
const DEFAULT_LOADING_MESSAGE = "正在同步数据...";
const DEFAULT_TABLE_LABEL = "数据表格";
const DEFAULT_SEARCH_PLACEHOLDER = "搜索表格内容...";
const DEFAULT_SEARCH_EMPTY_MESSAGE = "没有匹配的结果";
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50];

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
  searchConfig,
  paginationConfig,
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortState, setSortState] = useState<{ key: string; direction: SortDirection } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(paginationConfig?.pageSize ?? DEFAULT_PAGE_SIZE);
  const paginationEnabled = paginationConfig?.enabled ?? true;
  const pageSizeOptions = paginationConfig?.pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS;

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

  const totalPages = paginationEnabled
    ? Math.max(1, Math.ceil(visibleData.length / pageSize))
    : 1;
  const pageStart = paginationEnabled ? (page - 1) * pageSize : 0;
  const pageEnd = paginationEnabled ? pageStart + pageSize : visibleData.length;
  const pagedData = paginationEnabled ? visibleData.slice(pageStart, pageEnd) : visibleData;
  const displayStart = visibleData.length === 0 ? 0 : pageStart + 1;
  const displayEnd = Math.min(pageEnd, visibleData.length);

  const resolvedEmptyMessage =
    searchConfig && searchQuery.trim() ? (searchConfig.emptyMessage ?? DEFAULT_SEARCH_EMPTY_MESSAGE) : emptyMessage;

  useEffect(() => {
    setPage(1);
  }, [data, pageSize, searchQuery, sortState]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

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
              className="w-full border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] py-3 pl-11 pr-4 font-sans text-xs text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--brand)]"
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
            pagedData.map((row, rIndex) => (
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
      {paginationEnabled && !loading && !errorMessage && visibleData.length > 0 ? (
        <div className="flex flex-col gap-3 border-t border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 font-sans text-xs text-[var(--text-muted)] md:flex-row md:items-center md:justify-between">
          <div className="font-medium">
            显示 {displayStart}-{displayEnd} 条，共 {visibleData.length} 条
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              <span className="font-medium">每页</span>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="h-8 rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--bg-card)] px-3 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
                aria-label={`${tableLabel}每页条数`}
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--bg-card)] px-3 font-bold text-[var(--text-primary)] transition-colors disabled:cursor-not-allowed disabled:opacity-40 hover:not-disabled:border-[var(--brand)]"
            >
              <ChevronLeft size={14} />
              上一页
            </button>
            <span className="px-2 font-bold text-[var(--text-primary)]">
              第 {page}/{totalPages} 页
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
              className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--bg-card)] px-3 font-bold text-[var(--text-primary)] transition-colors disabled:cursor-not-allowed disabled:opacity-40 hover:not-disabled:border-[var(--brand)]"
            >
              下一页
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
