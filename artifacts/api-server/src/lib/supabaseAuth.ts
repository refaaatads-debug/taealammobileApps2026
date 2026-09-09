import type { AuthUser } from "@workspace/api-zod";
import { ReplitConnectors } from "@replit/connectors-sdk";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://ajyalalmaerifa.com";
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const connectorFetch = process.env.REPLIT_CONNECTORS_HOSTNAME
  ? new ReplitConnectors().createProxyFetch("supabase")
  : null;
const SUPABASE_DIRECT_TIMEOUT_MS = 8_000;

type SupabaseUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

type JwtClaims = {
  sub?: unknown;
  email?: unknown;
  user_metadata?: unknown;
};

export type PlatformRole = "student" | "teacher" | "parent" | "admin";

const PLATFORM_ROLES = new Set<PlatformRole>(["student", "teacher", "parent", "admin"]);

function bearerHeaders(accessToken: string): Record<string, string> {
  return {
    apikey: publishableKey ?? "",
    Authorization: `Bearer ${accessToken}`,
  };
}

function requestHeaders(accessToken?: string, initHeaders?: RequestInit["headers"]): Record<string, string> {
  return {
    ...(accessToken ? bearerHeaders(accessToken) : { apikey: publishableKey ?? "" }),
    Accept: "application/json",
    ...(initHeaders ? Object.fromEntries(new Headers(initHeaders).entries()) : {}),
  };
}

async function supabaseRequest(
  path: string,
  accessToken?: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = requestHeaders(accessToken, init.headers);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_DIRECT_TIMEOUT_MS);
  try {
    try {
      return await fetch(`${supabaseUrl}${path}`, {
        ...init,
        headers,
        signal: init.signal ?? controller.signal,
      });
    } catch (directError) {
      if (!connectorFetch) throw directError;
      return connectorFetch(path, { ...init, headers });
    }
  } finally {
    clearTimeout(timeout);
  }
}

function decodeJwtClaims(accessToken: string): JwtClaims | null {
  const payload = accessToken.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    return claims && typeof claims === "object" ? claims as JwtClaims : null;
  } catch {
    return null;
  }
}

export function readBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function getSupabaseUser(accessToken: string): Promise<SupabaseUser | null> {
  if (!publishableKey) return null;
  try {
    const response = await supabaseRequest("/auth/v1/user", accessToken);
    if (response.ok) {
      const user = await response.json() as SupabaseUser;
      return user.id ? user : null;
    }
  } catch {
    // Some Replit environments cannot reach the custom Auth endpoint. The
    // PostgREST proxy below still validates the same Bearer token via RLS.
  }

  const claims = decodeJwtClaims(accessToken);
  if (!claims || typeof claims.sub !== "string") return null;
  const userId = claims.sub;
  try {
    const query = new URLSearchParams({ user_id: `eq.${userId}`, select: "user_id", limit: "1" });
    const response = await supabaseRequest(`/rest/v1/profiles?${query.toString()}`, accessToken);
    if (!response.ok) return null;
    const rows = await response.json() as unknown;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return {
      id: userId,
      email: typeof claims.email === "string" ? claims.email : null,
      user_metadata: claims.user_metadata && typeof claims.user_metadata === "object"
        ? claims.user_metadata as Record<string, unknown>
        : undefined,
    };
  } catch {
    return null;
  }
}

export function toAuthUser(user: SupabaseUser): AuthUser {
  const metadata = user.user_metadata ?? {};
  const fullName = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
  const [firstName, ...lastNameParts] = fullName.split(/\s+/).filter(Boolean);
  return {
    id: user.id,
    email: user.email ?? null,
    firstName: typeof metadata.first_name === "string" ? metadata.first_name : firstName ?? null,
    lastName: typeof metadata.last_name === "string" ? metadata.last_name : lastNameParts.join(" ") || null,
    profileImageUrl: typeof metadata.avatar_url === "string" ? metadata.avatar_url : null,
  };
}

export async function getSupabaseProfile(accessToken: string, userId: string): Promise<Record<string, unknown> | null> {
  if (!publishableKey) return null;
  try {
    const query = new URLSearchParams({ user_id: `eq.${userId}`, select: "*" });
    const response = await supabaseRequest(`/rest/v1/profiles?${query.toString()}`, accessToken);
    if (!response.ok) return null;
    const rows = await response.json() as unknown;
    return Array.isArray(rows) && rows[0] && typeof rows[0] === "object"
      ? rows[0] as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export async function hasSupabaseRole(accessToken: string, userId: string, role: string): Promise<boolean> {
  if (!publishableKey) return false;
  try {
    const query = new URLSearchParams({
      user_id: `eq.${userId}`,
      role: `eq.${role}`,
      select: "user_id",
      limit: "1",
    });
    const response = await supabaseRequest(`/rest/v1/user_roles?${query.toString()}`, accessToken);
    if (!response.ok) return false;
    const rows = await response.json() as unknown;
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

export async function getSupabaseRoles(accessToken: string, userId: string): Promise<PlatformRole[]> {
  const rows = await supabaseTable<{ role?: unknown }>(accessToken, "user_roles", {
    user_id: `eq.${userId}`,
    select: "role",
  });
  return rows
    .map((row) => row.role)
    .filter((role): role is PlatformRole => typeof role === "string" && PLATFORM_ROLES.has(role as PlatformRole));
}

export async function getSupabaseTeacherApproval(accessToken: string, userId: string): Promise<boolean | null> {
  const rows = await supabaseTable<{ is_approved?: unknown }>(accessToken, "teacher_profiles", {
    user_id: `eq.${userId}`,
    select: "is_approved",
    limit: "1",
  });
  if (!rows[0]) return null;
  return rows[0].is_approved === true;
}

export async function isSupabaseUserBanned(accessToken: string, userId: string): Promise<boolean> {
  const rows = await supabaseTable(accessToken, "user_warnings", {
    user_id: `eq.${userId}`,
    is_banned: "eq.true",
    select: "user_id",
    limit: "1",
  });
  return rows.length > 0;
}

export async function supabaseTable<T = Record<string, unknown>>(
  accessToken: string,
  table: string,
  query: Record<string, string> = {},
  init: RequestInit = {},
): Promise<T[]> {
  if (!publishableKey) throw new Error("Supabase publishable key is not configured");
  const search = new URLSearchParams(query);
  const response = await supabaseRequest(`/rest/v1/${table}?${search.toString()}`, accessToken, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase ${table} request failed (${response.status}): ${detail.slice(0, 240)}`);
  }
  const body = await response.json() as unknown;
  return Array.isArray(body) ? body as T[] : [];
}

export async function supabaseRpc<T = unknown>(
  accessToken: string,
  functionName: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  if (!publishableKey) throw new Error("Supabase publishable key is not configured");
  const response = await supabaseRequest(`/rest/v1/rpc/${functionName}`, accessToken, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase RPC ${functionName} failed (${response.status}): ${detail.slice(0, 240)}`);
  }
  return await response.json() as T;
}

export async function supabasePublicTable<T = Record<string, unknown>>(
  table: string,
  query: Record<string, string> = {},
  init: RequestInit = {},
): Promise<T[]> {
  if (!publishableKey) throw new Error("Supabase publishable key is not configured");
  const search = new URLSearchParams(query);
  const response = await supabaseRequest(`/rest/v1/${table}?${search.toString()}`, undefined, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase public ${table} request failed (${response.status}): ${detail.slice(0, 240)}`);
  }
  const body = await response.json() as unknown;
  return Array.isArray(body) ? body as T[] : [];
}