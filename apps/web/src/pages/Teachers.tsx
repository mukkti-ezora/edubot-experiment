import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, relativeFromNow, formatNumber, typeLabel } from "@/lib/format";
import { useTableState } from "@/lib/useTableState";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import { DataTable } from "@/components/DataTable";
import { PageHead, EmptyState, ErrorState, Avatar, StatusPill, Badge, SectionHead, Alert, Button, IconButton } from "@/components/ui";
import {
  IconBookOpen,
  IconBuilding,
  IconSearch,
  IconChevronRight,
  IconPlus,
  IconFilter,
  IconArrowRight,
} from "@/components/icons";
import "@/styles/pages/people.css";

interface TeacherRow {
  id: string;
  institutionId: string | null;
  institutionName: string | null;
  type: "teacher";
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

interface TeachersResponse {
  items: TeacherRow[];
  nextCursor: string | null;
}

export function Teachers() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const table = useTableState({ status: "active", type: "teacher" });

  const { data, isLoading, error, refetch } = useQuery<{ items: TeacherRow[]; nextCursor: string | null }>({
    queryKey: ["teachers", table.sort, table.cursor, table.get("query"), table.get("status"), table.get("institutionId")],
    queryFn: async () => {
      const params: Record<string, string> = { type: "teacher", limit: "50" };
      if (table.sort) params.sort = table.sort;
      if (table.cursor) params.cursor = table.cursor;
      if (table.get("query")) params.query = table.get("query");
      if (table.get("status")) params.status = table.get("status");
      if (table.get("institutionId")) params.institutionId = table.get("institutionId");
      return api<{ items: TeacherRow[]; nextCursor: string | null }>("/api/v1/users", { method: "GET", body: JSON.stringify(params) });
    },
    placeholderData: (prev) => prev,
  });

  const handleRetry = () => refetch();

  const columns = [
    {
      key: "identity",
      label: "Teacher",
      width: "30%",
      render: (row: TeacherRow) => (
        <Link to={`/teachers/${row.id}`} className="ident">
          <Avatar name={row.name} category="teacher" />
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
      render: (row: TeacherRow) => (
        <div>
          <div className="cell-main">{row.institutionName ?? "—"}</div>
          {row.institutionId && <div className="cell-sub mono">{row.institutionId}</div>}
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (row: TeacherRow) => <span className="badge badge-teacher">{row.status}</span>,
    },
    {
      key: "lastActive",
      label: "Last active",
      render: (row: TeacherRow) => (
        <div className="cell-sub">{row.lastLoginAt ? relativeFromNow(row.lastLoginAt) : "Never"}</div>
      ),
    },
    {
      key: "created",
      label: "Joined",
      render: (row: TeacherRow) => <div className="cell-sub mono">{formatDate(row.createdAt)}</div>,
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (row: TeacherRow) => (
        <div className="cell-actions">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/teachers/${row.id}`)}>
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
    navigate("/teachers?create=1");
  };

  return (
    <div className="page-teachers">
      <PageHead
        title={<><IconBookOpen /> Teachers</>}
        sub="All teachers registered across all institutions."
        actions={<Button icon={<IconPlus />} onClick={handleCreate}>Create teacher</Button>}
      />

      <div className="filterbar" role="search" aria-label="Teacher filters">
        <div className="search-wrap">
          <IconSearch />
          <input
            className="input"
            placeholder="Search name or email…"
            value={table.get("query") || ""}
            onChange={(e) => table.set({ query: e.target.value })}
            aria-label="Search teachers"
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

      <DataTable<TeacherRow>
        columns={columns}
        rows={data?.items ?? []}
        keyOf={(r) => r.id}
        loading={isLoading}
        error={error}
        onRetry={handleRetry}
        sort={table.sort}
        onSort={table.onSort}
        sortable={new Set(["name", "email", "institutionName", "status", "createdAt", "lastLoginAt"])}
        onRowClick={(row) => navigate(`/teachers/${row.id}`)}
        empty={<EmptyState title="No teachers found" body="Try adjusting your filters or create a new teacher." icon={<IconBookOpen />} />}
        nextCursor={data?.nextCursor ?? null}
        onNext={table.onNext}
        onPrev={table.onPrev}
        pageIndex={table.pageIndex}
        countLabel={data?.items.length !== undefined ? `${formatNumber(data.items.length)} teachers on this page` : undefined}
      />
    </div>
  );
}