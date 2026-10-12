import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { formatDate, relativeFromNow, formatNumber } from "@/lib/format";
import { useTableState } from "@/lib/useTableState";
import { DataTable, Column } from "@/components/DataTable";
import { PageHead, EmptyState, Avatar, StatusPill, Button } from "@/components/ui";
import {
  IconHeart,
  IconSearch,
  IconChevronRight,
  IconPlus,
} from "@/components/icons";
import "@/styles/pages/people.css";

interface ParentRow {
  id: string;
  institutionId: string | null;
  institutionName: string | null;
  type: "parent";
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  status: "active" | "invited" | "suspended" | "deactivated";
  createdAt: string;
  updatedAt: string;
  roles?: { id: string; roleId: string; name: string }[];
  lastLoginAt?: string | null;
}

export function Parents() {
  const navigate = useNavigate();
  const table = useTableState({ status: "active", type: "parent" });

  const { data, isLoading, error, refetch } = useQuery<{ items: ParentRow[]; nextCursor: string | null }>({
    queryKey: ["parents", table.sort, table.cursor, table.get("query"), table.get("status"), table.get("institutionId")],
    queryFn: async () => {
      const params: Record<string, string> = { type: "parent", limit: "50" };
      if (table.sort) params.sort = table.sort;
      if (table.cursor) params.cursor = table.cursor;
      if (table.get("query")) params.query = table.get("query");
      if (table.get("status")) params.status = table.get("status");
      if (table.get("institutionId")) params.institutionId = table.get("institutionId");
      return api<{ items: ParentRow[]; nextCursor: string | null }>(`/api/v1/users${qs(params)}`);
    },
    placeholderData: (prev) => prev,
  });

  const handleRetry = () => refetch();

  const columns: Column<ParentRow>[] = [
    {
      key: "identity",
      label: "Parent",
      width: "30%",
      render: (row: ParentRow) => (
        <Link to={`/parents/${row.id}`} className="ident">
          <Avatar name={row.name} category="parent" />
          <div>
            <div className="ident-main">{row.name}</div>
            <div className="ident-sub mono">{row.email}</div>
          </div>
        </Link>
      ),
    },
    {
      key: "institution",
      label: "Institution",
      render: (row: ParentRow) => (
        <div>
          <div className="cell-main">{row.institutionName ?? "—"}</div>
          {row.institutionId && <div className="cell-sub mono">{row.institutionId}</div>}
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (row: ParentRow) => <StatusPill status={row.status} />,
    },
    {
      key: "lastActive",
      label: "Last active",
      render: (row: ParentRow) => (
        <div className="cell-sub">{row.lastLoginAt ? relativeFromNow(row.lastLoginAt) : "Never"}</div>
      ),
    },
    {
      key: "created",
      label: "Joined",
      render: (row: ParentRow) => <div className="cell-sub mono">{formatDate(row.createdAt)}</div>,
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (row: ParentRow) => (
        <div className="cell-actions">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/parents/${row.id}`)}>
            <IconChevronRight />
          </Button>
        </div>
      ),
    },
  ];

  const activeFilters = [
    table.get("query") && { key: "query", label: `Search: "${table.get("query")}"`, value: table.get("query") },
    table.get("status") && table.get("status") !== "active" && { key: "status", label: `Status: ${table.get("status")}`, value: table.get("status") },
    table.get("institutionId") && { key: "institutionId", label: `Institution: ${table.get("institutionId")}`, value: table.get("institutionId") },
  ].filter(Boolean) as { key: string; label: string; value: string }[];

  const handleCreate = () => {
    table.set({ query: "" }, { resetCursor: true });
    navigate("/parents?create=1");
  };

  return (
    <div className="page-parents">
      <PageHead
        title={<><IconHeart /> Parents</>}
        sub="All parents registered across all institutions."
        actions={<Button icon={<IconPlus />} onClick={handleCreate}>Create parent</Button>}
      />

      <div className="filterbar" role="search" aria-label="Parent filters">
        <div className="search-wrap">
          <IconSearch />
          <input
            className="input"
            placeholder="Search name or email…"
            value={table.get("query") || ""}
            onChange={(e) => table.set({ query: e.target.value })}
            aria-label="Search parents"
          />
          <kbd>⌘K</kbd>
        </div>
        <select className="select" value={table.get("status") || "active"} onChange={(e) => table.set({ status: e.target.value || null })} aria-label="Filter by status">
          <option value="active">Active</option>
          <option value="invited">Invited</option>
          <option value="suspended">Suspended</option>
          <option value="deactivated">Deactivated</option>
          <option value="">All statuses</option>
        </select>
        <select className="select" value={table.get("institutionId") || ""} onChange={(e) => table.set({ institutionId: e.target.value || null })} aria-label="Filter by institution">
          <option value="">All institutions</option>
        </select>
        {activeFilters.map((f) => (
          <button key={f.key} className="fchip" data-active="true" onClick={() => table.set({ [f.key]: null })}>
            {f.label}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        ))}
        {activeFilters.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => table.set({ query: null, status: null, institutionId: null }, { resetCursor: true })}>
            Clear all
          </Button>
        )}
      </div>

      <DataTable<ParentRow>
        columns={columns}
        rows={data?.items ?? []}
        keyOf={(r) => r.id}
        loading={isLoading}
        error={!!error}
        onRetry={handleRetry}
        sort={table.sort}
        onSort={table.onSort}
        sortable={new Set(["name", "email", "institutionName", "status", "createdAt", "lastLoginAt"])}
        onRowClick={(row) => navigate(`/parents/${row.id}`)}
        empty={<EmptyState title="No parents found" body="Try adjusting your filters or create a new parent." icon={<IconHeart />} />}
        nextCursor={data?.nextCursor ?? null}
        onNext={() => table.onNext(data?.nextCursor ?? null)}
        onPrev={table.onPrev}
        pageIndex={table.pageIndex}
        countLabel={data?.items.length !== undefined ? `${formatNumber(data.items.length)} parents on this page` : undefined}
      />
    </div>
  );
}