import { Platform } from "react-native";

export const BASE = ((process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "")) + "/api";

let authToken: string | null = null;

export function setAuthToken(t: string | null) {
  authToken = t;
}

export function getAuthToken() {
  return authToken;
}

export type ApiError = Error & { status?: number };

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data && data.detail) || `Terjadi kesalahan (${res.status})`) as ApiError;
    err.status = res.status;
    throw err;
  }
  return data as T;
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data && data.detail) || "Gagal mengunggah") as ApiError;
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function readPickedText(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    return await (await fetch(uri)).text();
  }
  const FS: any = await import("expo-file-system/legacy");
  return await FS.readAsStringAsync(uri);
}
