/** Typed API client. Speaks the problem-details error contract; refreshes the session once on 401. */

export interface ApiFailure {
  status: number;
  code: string;
  message: string;
  fields?: Record<string, string>;
  details?: unknown;
}

export class ApiError extends Error implements ApiFailure {
  status: number;
  code: string;
  fields?: Record<string, string>;
  details?: unknown;

  constructor(init: ApiFailure) {
    super(init.message);
    this.status = init.status;
    this.code = init.code;
    this.fields = init.fields;
    this.details = init.details;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.method && init.method !== "GET" ? { "X-Requested-With": "fetch" } : {}),
      ...(init.headers ?? {}),
    },
  });
}

export async function api<T>(
  path: string,
  init: RequestInit & { _retried?: boolean } = {},
): Promise<T> {
  const { _retried, ...initRest } = init;
  let response = await rawFetch(path, initRest);
  if (response.status === 401 && !path.startsWith("/api/v1/auth/") && !_retried) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      response = await rawFetch(path, initRest);
      if (!response.ok && response.status === 401) throw await toError(response);
      return unwrap<T>(response);
    }
  }
  if (!response.ok) throw await toError(response);
  return unwrap<T>(response);
}

async function tryRefresh(): Promise<boolean> {
  refreshPromise ??= (async () => {
    const response = await rawFetch("/api/v1/auth/refresh", { method: "POST", body: "{}" });
    return response.ok;
  })().finally(() => {
    setTimeout(() => (refreshPromise = null), 0);
  });
  return refreshPromise;
}

async function unwrap<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function toError(response: Response): Promise<ApiError> {
  let body: { code?: string; message?: string; details?: { fields?: Record<string, string> } } = {};
  try {
    body = await response.json();
  } catch {
    /* network-level failure */
  }
  return new ApiError({
    status: response.status,
    code: body.code ?? "NETWORK_ERROR",
    message: body.message ?? "The request couldn't reach the server. Check your connection and try again.",
    fields: body.details?.fields,
    details: body.details,
  });
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : "";
}
