export type ApiResult<T = Record<string, unknown>> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; code?: string; status: number; extra?: Record<string, unknown> };

export async function callApi<T = Record<string, unknown>>(
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const { error, code, ...extra } = data as { error?: string; code?: string };
      return { ok: false, error: error ?? `Request failed (${res.status})`, code, status: res.status, extra };
    }
    return { ok: true, data: data as T, status: res.status };
  } catch {
    return { ok: false, error: "Network error — is the server running?", status: 0 };
  }
}

export function toastSetter(setMsg: (m: { kind: "ok" | "err"; text: string } | null) => void) {
  return (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4200);
  };
}
