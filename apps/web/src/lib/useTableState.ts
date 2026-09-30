import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * URL-persisted table state: filters + sort + keyset cursors all live in the address bar.
 *
 * Model: `cursor` is the cursor that produced the CURRENT page; `stack` holds the
 * cursors that produced each previous page, pipe-joined; "~" encodes the first page
 * (a null cursor). Page 0 = no cursor, empty stack. Back/forward works because the
 * whole stack lives in the URL.
 */
const FIRST = "~";

export function useTableState(defaults: Record<string, string> = {}) {
  const [params, setParams] = useSearchParams();

  const get = useCallback(
    (key: string) => params.get(key) ?? defaults[key] ?? "",
    [params, defaults],
  );

  const set = useCallback(
    (updates: Record<string, string | null>, { resetCursor = true } = {}) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "" || value === defaults[key]) next.delete(key);
        else next.set(key, value);
      }
      if (resetCursor) {
        next.delete("cursor");
        next.delete("stack");
      }
      setParams(next, { replace: true });
    },
    [params, setParams, defaults],
  );

  const sort = params.get("sort") ?? null;
  const cursor = params.get("cursor") ?? null;
  const stack = (params.get("stack") ?? "").split("|").filter((s) => s !== "");

  const onSort = useCallback(
    (key: string) => {
      const current = params.get("sort");
      const nextSort = current === key ? `-${key}` : current === `-${key}` ? null : key;
      set({ sort: nextSort });
    },
    [params, set],
  );

  const onNext = useCallback(
    (nextCursor: string | null) => {
      if (!nextCursor) return;
      const next = new URLSearchParams(params);
      const currentStack = (next.get("stack") ?? "").split("|").filter((s) => s !== "");
      currentStack.push(cursor ?? FIRST);
      next.set("stack", currentStack.join("|"));
      next.set("cursor", nextCursor);
      setParams(next);
    },
    [params, cursor, setParams],
  );

  const onPrev = useCallback(() => {
    const next = new URLSearchParams(params);
    const currentStack = (next.get("stack") ?? "").split("|").filter((s) => s !== "");
    const popped = currentStack.pop() ?? FIRST;
    if (popped === FIRST) next.delete("cursor");
    else next.set("cursor", popped);
    if (currentStack.length) next.set("stack", currentStack.join("|"));
    else next.delete("stack");
    setParams(next);
  }, [params, setParams]);

  return { get, set, sort, cursor, pageIndex: stack.length, onSort, onNext, onPrev };
}
