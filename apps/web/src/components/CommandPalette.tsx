import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  IconActivity,
  IconBuilding,
  IconDashboard,
  IconPlus,
  IconSearch,
  IconSettings,
  IconShield,
  IconUser,
  IconUserPlus,
  IconUsers,
} from "./icons";

export interface CommandItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  run: () => void;
}

export function useCommandState() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<CommandItem[]>(() => {
    const go = (to: string) => () => {
      onClose();
      navigate(to);
    };
    const all: CommandItem[] = [
      { id: "dashboard", group: "Navigate", label: "Go to Dashboard", icon: <IconDashboard />, hint: "Overview", run: go("/dashboard") },
      { id: "institutions", group: "Navigate", label: "Go to Institutions", icon: <IconBuilding />, hint: "Directory", run: go("/institutions") },
      { id: "users", group: "Navigate", label: "Go to Users", icon: <IconUsers />, hint: "Directory", run: go("/users") },
      { id: "admins", group: "Navigate", label: "Go to Administrators", icon: <IconShield />, hint: "Directory", run: go("/administrators") },
      { id: "roles", group: "Navigate", label: "Go to Roles & permissions", icon: <IconUser />, hint: "Governance", run: go("/roles") },
      { id: "activity", group: "Navigate", label: "Go to Activity", icon: <IconActivity />, hint: "Governance", run: go("/activity") },
      { id: "settings", group: "Navigate", label: "Go to Settings", icon: <IconSettings />, hint: "System", run: go("/settings") },
      { id: "profile", group: "Navigate", label: "Go to Profile", icon: <IconUser />, hint: "System", run: go("/profile") },
    ];
    if (can("institution.create"))
      all.push({ id: "new-institution", group: "Actions", label: "Create institution", icon: <IconPlus />, run: go("/institutions?create=1") });
    if (can("admin.create"))
      all.push({ id: "invite-admin", group: "Actions", label: "Invite administrator", icon: <IconUserPlus />, run: go("/administrators?invite=1") });
    if (can("role.create"))
      all.push({ id: "new-role", group: "Actions", label: "Create role", icon: <IconPlus />, run: go("/roles?create=1") });

    const visible = all.filter((i) =>
      i.id === "profile" ? true : i.group === "Actions" ? true : navAllowed(i.id, can),
    );
    const q = query.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter((i) => `${i.label} ${i.group} ${i.hint ?? ""}`.toLowerCase().includes(q));
  }, [query, can, navigate, onClose]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open) return null;

  const groups = [...new Set(items.map((i) => i.group))];

  const runItem = (item: CommandItem | undefined) => item?.run();

  return (
    <div
      className="cmdk-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command menu">
        <div className="cmdk-input-row">
          <IconSearch />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search pages and actions…"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={items[index] ? `cmdk-item-${items[index].id}` : undefined}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(items.length - 1, i + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              }
              if (e.key === "Enter") runItem(items[index]);
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div className="cmdk-list" role="listbox" id="cmdk-list" ref={listRef}>
          {items.length === 0 && <div className="cmdk-empty">No results for “{query}”.</div>}
          {groups.map((group) => (
            <div key={group}>
              <div className="cmdk-group-label">{group}</div>
              {items
                .filter((i) => i.group === group)
                .map((item) => {
                  const flatIndex = items.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      id={`cmdk-item-${item.id}`}
                      role="option"
                      data-index={flatIndex}
                      aria-selected={flatIndex === index}
                      className="cmdk-item"
                      onMouseEnter={() => setIndex(flatIndex)}
                      onClick={() => runItem(item)}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                      {item.hint ? <span className="hint">{item.hint}</span> : null}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
        <div className="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

function navAllowed(id: string, can: (perm: string) => boolean): boolean {
  const perms: Record<string, string> = {
    dashboard: "dashboard.read",
    institutions: "institution.read",
    users: "user.read",
    admins: "admin.read",
    roles: "role.read",
    activity: "audit.read",
    settings: "settings.read",
  };
  return perms[id] ? can(perms[id]) : true;
}
