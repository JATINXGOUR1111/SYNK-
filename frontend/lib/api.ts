export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
const TOKEN_KEY = "cm-token";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string | null): void {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void { onUnauthorized = fn; }

function readable(detail: unknown, status: number): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const d = detail[0] as { msg?: string; loc?: (string | number)[] };
    const field = d.loc && d.loc.length ? String(d.loc[d.loc.length - 1]) : "";
    return `${field ? field + ": " : ""}${(d.msg || "Invalid input").replace(/^Value error, /, "")}`;
  }
  if (status === 429) return "Too many requests. Please slow down.";
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  return "Request failed.";
}

async function request<T>(path: string, init: RequestInit = {}, isForm = false): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!isForm && init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Cannot reach the server. Check your connection and retry.", 0);
  }
  if (res.status === 401 && token) { setToken(null); onUnauthorized?.(); }
  if (!res.ok) {
    let detail: unknown = null;
    try { detail = (await res.json()).detail; } catch { /* non-JSON error */ }
    throw new ApiError(readable(detail, res.status), res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

type Q = Record<string, string | number | boolean | null | undefined>;
export function qs(params: Q): string {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") p.set(k, String(v)); });
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  get: <T,>(path: string, params?: Q) => request<T>(path + (params ? qs(params) : "")),
  post: <T,>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T,>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  patch: <T,>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  del: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
  form: <T,>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }, true),
};

/** Relative media paths (/uploads/…, /static/…) are served by the API; prefix its origin. */
export function mediaUrl(u: string | null | undefined): string {
  if (!u) return "";
  return u.startsWith("/") ? `${API_URL}${u}` : u;
}

/** Multipart upload with progress (fetch cannot report upload progress). */
export function uploadForm<T>(path: string, form: FormData, onProgress?: (pct: number) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/api${path}`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onerror = () => reject(new ApiError("Upload failed. Check your connection and try again.", 0));
    xhr.ontimeout = () => reject(new ApiError("Upload timed out. Try a smaller file.", 0));
    xhr.timeout = 10 * 60 * 1000;
    xhr.onload = () => {
      let body: unknown = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status === 401 && token) { setToken(null); onUnauthorized?.(); }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else if (xhr.status === 413) reject(new ApiError("That file is too large.", 413));
      else reject(new ApiError(readable((body as { detail?: unknown } | null)?.detail, xhr.status), xhr.status));
    };
    xhr.send(form);
  });
}
