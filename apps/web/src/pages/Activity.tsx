import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import type { AuditEvent, Institution, Page } from "@/lib/types";
import { actionLabel, formatDateTime, formatNumber, relativeFromNow } from "@/lib/format";
import { Badge, Button, EmptyState, ErrorState, PageHead, SkeletonRows, type Tone } from "@/components/ui";
import {
  IconActivity,
  IconAlertTriangle,
  IconBan,
  IconCheckCircle,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconSearch,
  IconX,
} from "@/components/icons";
import { useTableState } from "@/lib/useTableState";
import "@/styles/pages/system.css";

type Result = AuditEvent["result"];

/** One result vocabulary for the whole page: icon tone, badge tone, filter chips. */
const RESULT_META: Record<Result, { tone: Tone; tlTone: string; Icon: typeof IconCheckCircle }> = {
  success: { tone: "ok", tlTone: "tone-ok", Icon: IconCheckCircle },
  denied: { tone: "danger", tlTone: "tone-danger", Icon: IconBan },
  error: { tone: "warn", tlTone: "tone-warn", Icon: IconAlertTriangle },
};

function resultLabel(result: Result): string {
  return result.charAt(0).toUpperCase() + result.slice(1);
}

interface DiffRow {
  key: string;
  before: unknown;
  after: unknown;
}

/** Diffs arrive in two shapes: { field: { before, after } } or { field: plain-value }. */
function diffRows(diff: Record<string, unknown>): DiffRow[] {
  return Object.entries(diff).map(([key, value]) => {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      ("before" in value || "after" in value)
    ) {
      const pair = value as { before?: unknown; after?: unknown };
      return { key, before: pair.before, after: pair.after };
    }
    return { key, before: undefined, after: value };
  });
}

function cellText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function EventRow({
  event,
  open,
  onToggle,
}: {
  event: AuditEvent;
  open: boolean;
  onToggle: () => void;
}) {
  const meta = RESULT_META[event.result];
  const { Icon } = meta;
  const detailId = `evt-${event.id}-detail`;
  const changes = event.diff && Object.keys(event.diff).length > 0 ? diffRows(event.diff) : null;

  return (
    <li className="evt" data-open={open}>
      <button
        type="button"
        className="evt-row"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <span className={`tl-icon ${meta.tlTone}`} aria-hidden="true">
          <Icon />
        </span>
        <span className="evt-body">
          <span className="evt-line">
            <b>{event.actorLabel ?? "System"}</b> {actionLabel(event.action)}
            {event.targetLabel ? <> → {event.targetLabel}</> : null}
          </span>
          <span className="evt-meta">
            <span>{event.institutionLabel ?? "Platform"}</span>
            <span aria-hidden="true">·</span>
            <span className="mono">{event.targetType ?? "—"}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={event.occurredAt} title={formatDateTime(event.occurredAt)}>
              {relativeFromNow(event.occurredAt)}
            </time>
          </span>
        </span>
        <span className="evt-right">
          <Badge tone={meta.tone}>{resultLabel(event.result)}</Badge>
          <IconChevronDown className="evt-chev" aria-hidden="true" />
        </span>
      </button>
      <div className="evt-detail" id={detailId}>
        <div className="evt-detail-in">
          <div className="evt-detail-pad">
            <dl className="kv">
              <dt>Occurred</dt>
              <dd>{formatDateTime(event.occurredAt)}</dd>
              <dt>Request</dt>
              <dd className="mono truncate" title={event.requestId ?? undefined}>
                {event.requestId ?? "—"}
              </dd>
              <dt>IP</dt>
              <dd>{event.ip ?? "—"}</dd>
              <dt>Actor type</dt>
              <dd>{event.actorType}</dd>
            </dl>
            {changes && (
              <div>
                <div className="evt-changes-head">Changes</div>
                <div className="evt-diff">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col" style={{ width: "32%" }}>Field</th>
                        <th scope="col" style={{ width: "34%" }}>Before</th>
                        <th scope="col">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map((row) => {
                        const before = cellText(row.before);
                        const after = cellText(row.after);
                        return (
                          <tr key={row.key}>
                            <td className="diff-key">{row.key}</td>
                            <td className={before !== null ? "diff-old" : undefined}>
                              {before !== null ? (
                                <span className="diff-val" title={before}>{before}</span>
                              ) : (
                                <span className="diff-none">—</span>
                              )}
                            </td>
                            <td className={after !== null ? "diff-new" : undefined}>
                              {after !== null ? (
                                <span className="diff-val" title={after}>{after}</span>
                              ) : (
                                <span className="diff-none">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export function Activity() {
  const table = useTableState();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const query = table.get("query");
  const action = table.get("action");
  const result = table.get("result");
  const institutionId = table.get("institutionId");
  const actorId = table.get("actorId");

  const { data: institutions } = useQuery({
    queryKey: ["institutions", "options"],
    queryFn: () => api<Page<Institution>>("/api/v1/institutions?limit=100&sort=name"),
    staleTime: 120_000,
  });
  const { data: actions } = useQuery({
    queryKey: ["activity-actions"],
    queryFn: () => api<string[]>("/api/v1/activity/actions"),
    staleTime: 60_000,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["activity", query, action, result, institutionId, actorId, table.cursor],
    queryFn: () =>
      api<Page<AuditEvent>>(
        `/api/v1/activity${qs({
          query: query || undefined,
          action: action || undefined,
          result: result || undefined,
          institutionId: institutionId || undefined,
          actorId: actorId || undefined,
          cursor: table.cursor ?? undefined,
        })}`,
      ),
    placeholderData: (previous) => previous,
    refetchInterval: 45_000,
  });

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleResult = (value: Result) =>
    table.set({ result: result === value ? null : value });

  const clearAll = () =>
    table.set({ query: null, action: null, result: null, institutionId: null, actorId: null });

  const activeCount = [query, action, result, institutionId, actorId].filter(Boolean).length;
  const institutionName = institutions?.items.find((inst) => inst.id === institutionId)?.name;
  const items = data?.items ?? [];

  return (
    <div className="page-activity">
      <PageHead
        title="Activity"
        sub="Immutable audit trail — every mutation and denied privileged attempt is recorded."
      />

      <div className="filterbar" role="search">
        <div className="search-wrap">
          <IconSearch />
          <input
            className="input"
            placeholder="Search actor, action, target…"
            aria-label="Search activity"
            value={query}
            onChange={(e) => table.set({ query: e.target.value || null })}
          />
        </div>
        <select
          className="select"
          aria-label="Filter by action"
          value={action}
          onChange={(e) => table.set({ action: e.target.value || null })}
        >
          <option value="">All actions</option>
          {(actions ?? []).map((a) => (
            <option key={a} value={a}>{actionLabel(a)}</option>
          ))}
        </select>
        <select
          className="select"
          aria-label="Filter by institution"
          value={institutionId}
          onChange={(e) => table.set({ institutionId: e.target.value || null })}
        >
          <option value="">All institutions</option>
          {institutions?.items.map((inst) => (
            <option key={inst.id} value={inst.id}>{inst.name}</option>
          ))}
        </select>
        <span className="fb-div" aria-hidden="true" />
        <div className="act-results" role="group" aria-label="Filter by result">
          <button
            type="button"
            className="fchip"
            data-active={result === "success"}
            aria-pressed={result === "success"}
            onClick={() => toggleResult("success")}
          >
            <IconCheckCircle className="tone-ok" />
            Success
          </button>
          <button
            type="button"
            className="fchip"
            data-active={result === "denied"}
            aria-pressed={result === "denied"}
            onClick={() => toggleResult("denied")}
          >
            <IconBan className="tone-danger" />
            Denied
          </button>
          <button
            type="button"
            className="fchip"
            data-active={result === "error"}
            aria-pressed={result === "error"}
            onClick={() => toggleResult("error")}
          >
            <IconAlertTriangle className="tone-warn" />
            Error
          </button>
        </div>
        {activeCount > 0 && (
          <>
            <Badge tone="neutral">{activeCount} active</Badge>
            {query && (
              <button
                type="button"
                className="fchip"
                aria-label="Clear search filter"
                onClick={() => table.set({ query: null })}
              >
                Search: {query}
                <span className="x" aria-hidden="true"><IconX /></span>
              </button>
            )}
            {action && (
              <button
                type="button"
                className="fchip"
                aria-label="Clear action filter"
                onClick={() => table.set({ action: null })}
              >
                {actionLabel(action)}
                <span className="x" aria-hidden="true"><IconX /></span>
              </button>
            )}
            {institutionId && (
              <button
                type="button"
                className="fchip"
                aria-label="Clear institution filter"
                onClick={() => table.set({ institutionId: null })}
              >
                {institutionName ?? "One institution"}
                <span className="x" aria-hidden="true"><IconX /></span>
              </button>
            )}
            {actorId && (
              <button
                type="button"
                className="fchip"
                aria-label="Clear actor filter"
                onClick={() => table.set({ actorId: null })}
              >
                One actor
                <span className="x" aria-hidden="true"><IconX /></span>
              </button>
            )}
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear all
            </Button>
          </>
        )}
      </div>

      {isError ? (
        <div className="card">
          <ErrorState title="The activity log couldn't load" onRetry={() => refetch()} />
        </div>
      ) : (
        <div className="card">
          {isLoading ? (
            <div className="act-skel">
              <SkeletonRows rows={8} />
            </div>
          ) : items.length === 0 ? (
            activeCount > 0 ? (
              <EmptyState
                title="No events match these filters"
                body="Nothing in the trail matches the current search and filters. Adjust the search or clear the filters to see more."
                action={
                  <Button variant="secondary" size="sm" onClick={clearAll}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<IconActivity />}
                title="No activity yet"
                body="Events appear here as people use the platform — including denied privileged attempts. Records are permanent."
              />
            )
          ) : (
            <ul className="act-list">
              {items.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  open={open.has(event.id)}
                  onToggle={() => toggle(event.id)}
                />
              ))}
            </ul>
          )}
          <div className="table-foot">
            <span className="count">
              {data ? `${formatNumber(items.length)} shown this page` : ""}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={table.onPrev}
              disabled={table.pageIndex === 0}
            >
              <IconChevronLeft />
              Previous
            </button>
            <span className="meta tnum">Page {table.pageIndex + 1}</span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => table.onNext(data?.nextCursor ?? null)}
              disabled={!data?.nextCursor || isLoading}
            >
              Next
              <IconChevronRight />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
