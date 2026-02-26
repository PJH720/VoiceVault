import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  render?: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  emptyMessage = "No data",
  className,
}: DataTableProps<T>) {
  return (
    <div
      className={cn("overflow-x-auto border", className)}
      style={{ borderColor: "var(--border)" }}
    >
      <table className="w-full font-mono text-xs" role="table">
        <thead>
          <tr
            style={{ background: "var(--surface-3)" }}
          >
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className="px-3 py-2 text-left font-bold uppercase tracking-widest"
                style={{
                  color: "var(--fg-2)",
                  width: col.width,
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center uppercase tracking-widest"
                style={{ color: "var(--fg-3)" }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr
                key={i}
                className={cn(
                  "border-b transition-colors",
                  onRowClick && "cursor-pointer hover:bg-[var(--surface-2)]",
                )}
                style={{
                  background: i % 2 === 0 ? "var(--surface)" : "var(--surface-2)",
                  borderColor: "var(--border)",
                }}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="px-3 py-2"
                    style={{ color: "var(--fg)" }}
                  >
                    {col.render
                      ? col.render(row)
                      : String(row[col.key] ?? "")}
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

/* ── StatusCell helper ── */
type StatusVariant = "pass" | "warn" | "fail" | "info";

const statusColorMap: Record<StatusVariant, string> = {
  pass: "var(--green)",
  warn: "var(--amber)",
  fail: "var(--red)",
  info: "var(--cyan)",
};

export function StatusCell({
  label,
  variant,
}: {
  label: string;
  variant: StatusVariant;
}) {
  return (
    <span
      className="font-bold uppercase"
      style={{ color: statusColorMap[variant] }}
    >
      {label}
    </span>
  );
}
