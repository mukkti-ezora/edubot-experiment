import { ErrorState, SkeletonRows } from "./ui";
import { IconChevronLeft, IconChevronRight } from "./icons";

export interface Column<T> {
  key: string;
  label: string;
  width?: string;
  align?: "left" | "right";
  render: (row: T) => React.ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  sort: string | null;
  onSort: (key: string) => void;
  sortable?: Set<string>;
  onRowClick?: (row: T) => void;
  empty: React.ReactNode;
  nextCursor: string | null;
  onNext: () => void;
  onPrev: () => void;
  pageIndex: number;
  countLabel?: string;
  toolbar?: React.ReactNode;
}

/** The console's core instrument: dense, hairline-bound, URL-state driven. */
export function DataTable<T>({
  columns,
  rows,
  keyOf,
  loading,
  error,
  onRetry,
  sort,
  onSort,
  sortable,
  onRowClick,
  empty,
  nextCursor,
  onNext,
  onPrev,
  pageIndex,
  countLabel,
  toolbar,
}: Props<T>) {
  const activeSort = sort ?? "";
  const descending = activeSort.startsWith("-");
  const activeKey = descending ? activeSort.slice(1) : activeSort;

  return (
    <div className="table-shell">
      {toolbar}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              {columns.map((column) => {
                const isSortable = sortable?.has(column.key);
                const isActive = activeKey === column.key;
                return (
                  <th
                    key={column.key}
                    style={{
                      width: column.width,
                      textAlign: column.align === "right" ? "right" : undefined,
                    }}
                    className={isSortable ? "sortable" : undefined}
                    onClick={isSortable ? () => onSort(column.key) : undefined}
                    aria-sort={isActive ? (descending ? "descending" : "ascending") : undefined}
                    tabIndex={isSortable ? 0 : undefined}
                    onKeyDown={
                      isSortable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSort(column.key);
                            }
                          }
                        : undefined
                    }
                  >
                    {column.label}
                    {isActive && (
                      <span className={`sort-arrow${descending ? " desc" : ""}`} aria-hidden="true" />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 0, border: "none" }}>
                  <SkeletonRows />
                </td>
              </tr>
            ) : error || rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 0, border: "none" }} />
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={keyOf(row)}
                  className={onRowClick ? "rowlink" : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter") onRowClick(row);
                        }
                      : undefined
                    }
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={column.align === "right" ? "cell-actions" : undefined}
                      style={column.align === "right" ? { textAlign: "right" } : undefined}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!loading && !error && rows.length === 0 && empty}
        {!loading && error && <ErrorState onRetry={onRetry} />}
      </div>
      <div className="table-foot">
        <span className="count">{countLabel ?? ""}</span>
        <button className="btn btn-secondary btn-sm" onClick={onPrev} disabled={pageIndex === 0}>
          <IconChevronLeft />
          Previous
        </button>
        <span className="meta tnum">Page {pageIndex + 1}</span>
        <button className="btn btn-secondary btn-sm" onClick={onNext} disabled={!nextCursor || loading}>
          Next
          <IconChevronRight />
        </button>
      </div>
    </div>
  );
}
