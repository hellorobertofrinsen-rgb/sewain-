import { Platform } from "react-native";

// Empty EXPO_PUBLIC_BACKEND_URL = same origin (the backend serves the web app itself).
export const ORIGIN = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
export const BASE = ORIGIN + "/api";

let authToken: string | null = null;

export function setAuthToken(t: string | null) {
  authToken = t;
}

export function getAuthToken() {
  return authToken;
}

export type ApiError = Error & { status?: number; code?: string };

// Screens can mount before the saved login token is read from storage (a full reload of
// the installed app). Data requests wait until AuthProvider has restored the session.
let markReady: () => void = () => {};
const authReady = new Promise<void>((resolve) => (markReady = resolve));
export function markAuthReady() {
  markReady();
}

// Plan-limit errors (403 with detail.code "limit_*" / "feature_*") are reported here so
// the app can open the upgrade sheet no matter which screen triggered them.
type PlanErrorListener = (code: string, message: string) => void;
let planErrorListener: PlanErrorListener | null = null;
export function onPlanError(fn: PlanErrorListener | null) {
  planErrorListener = fn;
}

async function toError(res: Response, fallback: string): Promise<ApiError> {
  const data = await res.json().catch(() => ({}));
  const detail = data?.detail;
  const message =
    typeof detail === "string" ? detail : detail?.message || (Array.isArray(detail) ? "Data belum lengkap atau tidak valid." : fallback);
  const err = new Error(message) as ApiError;
  err.status = res.status;
  if (detail && typeof detail === "object" && typeof detail.code === "string") {
    err.code = detail.code;
    if (/^(limit|feature)_/.test(detail.code)) planErrorListener?.(detail.code, message);
  }
  return err;
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any } = {},
): Promise<T> {
  if (!path.startsWith("/auth/") && path !== "/me") await authReady;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new Error("Tidak bisa terhubung. Cek koneksi internetmu.") as ApiError;
  }
  if (!res.ok) throw await toError(res, `Terjadi kesalahan (${res.status})`);
  return (await res.json().catch(() => ({}))) as T;
}

/** Download a file from the API (web): fetch with auth, then save via a temporary link. */
export async function downloadFile(path: string, filename: string) {
  const res = await fetch(`${BASE}${path}`, { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} });
  if (!res.ok) throw await toError(res, "Gagal mengunduh");
  if (Platform.OS !== "web") return;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** URL for an uploaded unit photo (or a plain http URL as-is). */
export function photoUrl(photo: string, token: string | null) {
  if (photo.startsWith("http")) return photo;
  return `${BASE}/files/${photo}?token=${token ?? ""}`;
}

function guessMime(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "csv") return "text/csv";
  if (ext === "txt") return "text/plain";
  return "image/jpeg";
}

export async function uploadFile(path: string, uri: string, name: string) {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type: guessMime(name) } as any);
  }
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: form as any });
  if (!res.ok) throw await toError(res, "Gagal mengunggah");
  return res.json().catch(() => ({}));
}

export async function readPickedText(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    return await (await fetch(uri)).text();
  }
  const FS: any = await import("expo-file-system/legacy");
  return await FS.readAsStringAsync(uri);
}
