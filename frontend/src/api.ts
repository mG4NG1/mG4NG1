import { storage } from "@/src/utils/storage";

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
const BASE = `${BACKEND_URL}/api`;
export const TOKEN_KEY = "session_token";

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setToken(t: string | null) {
  token = t;
}
export function getToken() {
  return token;
}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

// Uploaded pictures live behind the API and need auth; Google avatars are plain URLs.
// Native can send headers; a web <img> can't, so it gets a short token in the query string.
export function pictureSource(picture: string | null | undefined, isWeb: boolean): { uri: string; headers?: Record<string, string> } | null {
  if (!picture) return null;
  if (!picture.startsWith("/api/")) return { uri: picture };
  const uri = `${BACKEND_URL}${picture}`;
  if (isWeb) return { uri: token ? `${uri}?token=${encodeURIComponent(token)}` : uri };
  return { uri, headers: token ? { Authorization: `Bearer ${token}` } : undefined };
}

export async function loadToken() {
  token = await storage.secureGet<string | null>(TOKEN_KEY, null);
  return token;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: any } = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && token) {
    onUnauthorized?.();
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const d = data?.detail;
    throw new Error(typeof d === "string" ? d : Array.isArray(d) ? d[0]?.msg ?? "Request failed" : "Request failed");
  }
  return data as T;
}

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  phone?: string | null;
  trade?: string | null;
  business_name?: string | null;
  bio?: string | null;
  suburb?: string | null;
  approx_lat?: number | null;
  approx_lng?: number | null;
  profile_complete: boolean;
  picture_kind?: "photo" | "logo" | null;
  phone_verified: boolean;
  lifetime_pro: boolean;
};

export type Person = {
  user_id: string;
  name: string;
  picture?: string | null;
  picture_kind?: "photo" | "logo" | null;
  phone_verified?: boolean;
  trade?: string | null;
  business_name?: string | null;
  bio?: string | null;
  suburb?: string | null;
  connection: "none" | "sent" | "received" | "connected";
  connection_id?: string | null;
  distance_km?: number | null;
};

export type CrewMember = Person & {
  phone?: string | null;
  approx_lat?: number | null;
  approx_lng?: number | null;
  connection_id: string;
};

export type Message = { message_id: string; from_id: string; to_id: string; text: string; created_at: string };
export type SmsStatus = { messaging: boolean; verify: boolean };

export type PostType = "job" | "work";
export type Post = {
  post_id: string;
  type: PostType;
  trade: string;
  title: string;
  details?: string | null;
  start?: string | null;
  duration?: string | null;
  pay_min?: number | null;
  pay_max?: number | null;
  suburb?: string | null;
  created_at: string;
  expires_at: string;
  author: Person;
  mine: boolean;
  is_crew: boolean;
  distance_km?: number | null;
  keen: boolean;
  keen_count: number;
  responders: { user_id: string; name: string; picture?: string | null; picture_kind?: "photo" | "logo" | null; trade?: string | null; at: string }[];
};
export type PostOptions = { pay_bands: { min: number; max: number; label: string }[]; durations: string[]; trades: string[]; job_days: number; work_days: number };

export const payLabel = (p: { pay_min?: number | null; pay_max?: number | null }) => (p.pay_min && p.pay_max ? `$${p.pay_min}-${p.pay_max}/hr` : "Pay negotiable");
export type Conversation = {
  other: Person;
  last_text: string;
  last_at: string;
  last_from_me: boolean;
};
