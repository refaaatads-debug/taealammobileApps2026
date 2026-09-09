import {
  ExchangeMobileAuthorizationCodeBody,
  ExchangeMobileAuthorizationCodeResponse,
  GetCurrentAuthUserResponse,
  LogoutMobileSessionResponse,
} from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { Router, type IRouter, type Request, type Response } from "express";
import * as oidc from "openid-client";
import {
  clearSession,
  createSession,
  deleteSession,
  getOidcConfig,
  getSessionId,
  ISSUER_URL,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/auth";

const router: IRouter = Router();
const OIDC_COOKIE_TTL = 10 * 60 * 1000;

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  return `${proto}://${host}`;
}

function safeReturnTo(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function setSessionCookie(res: Response, sid: string): void {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string): void {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function claimString(claims: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    if (typeof claims[key] === "string" && claims[key].trim()) return claims[key] as string;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorStatus(value: Record<string, unknown>): number | string | undefined {
  if (typeof value.status === "number" || typeof value.status === "string") return value.status;
  if (typeof value.statusCode === "number" || typeof value.statusCode === "string") return value.statusCode;
  return undefined;
}

function safeErrorMetadata(error: unknown): Record<string, unknown> {
  if (!isRecord(error)) return { errorName: typeof error };
  const causeStatus = isRecord(error.cause) ? errorStatus(error.cause) : undefined;
  return {
    errorName: error instanceof Error ? error.name : "Error",
    errorStatus: errorStatus(error) ?? causeStatus,
  };
}

async function upsertUser(claims: Record<string, unknown>) {
  const userData = {
    id: claimString(claims, "sub")!,
    email: claimString(claims, "email"),
    firstName: claimString(claims, "first_name", "given_name"),
    lastName: claimString(claims, "last_name", "family_name"),
    profileImageUrl: claimString(claims, "profile_image_url", "picture"),
    role: claimString(claims, "role") === "teacher" ? "teacher" as const : "student" as const,
  };
  const [user] = await db.insert(usersTable).values(userData).onConflictDoUpdate({
    target: usersTable.id,
    set: { ...userData, updatedAt: new Date() },
  }).returning();
  return user;
}

router.get("/auth/user", (req, res) => {
  res.json(GetCurrentAuthUserResponse.parse({ user: req.isAuthenticated() ? req.user : null }));
});

router.get("/login", async (req, res): Promise<void> => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });
  setOidcCookie(res, "code_verifier", codeVerifier);
  setOidcCookie(res, "nonce", nonce);
  setOidcCookie(res, "state", state);
  setOidcCookie(res, "return_to", safeReturnTo(req.query.returnTo));
  res.redirect(redirectTo.href);
});

router.get("/callback", async (req, res): Promise<void> => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;
  const codeVerifier = req.cookies?.code_verifier;
  const expectedState = req.cookies?.state;
  if (!codeVerifier || !expectedState) {
    res.redirect("/api/login");
    return;
  }
  const currentUrl = new URL(`${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`);
  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: req.cookies?.nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch (error) {
    req.log.warn({ errorName: error instanceof Error ? error.name : "unknown" }, "Browser login failed");
    res.redirect("/api/login");
    return;
  }
  const claims = tokens.claims();
  if (!claims) {
    res.redirect("/api/login");
    return;
  }
  const dbUser = await upsertUser(claims as unknown as Record<string, unknown>);
  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
    },
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };
  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  for (const name of ["code_verifier", "nonce", "state", "return_to"]) res.clearCookie(name, { path: "/" });
  res.redirect(safeReturnTo(req.cookies?.return_to));
});

router.get("/logout", async (req, res): Promise<void> => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  const config = await getOidcConfig();
  const postLogoutRedirectUrl = new URL(safeReturnTo(req.query.returnTo), `${getOrigin(req)}/`).href;
  const endSessionUrl = oidc.buildEndSessionUrl(config, {
    client_id: process.env.REPL_ID!,
    post_logout_redirect_uri: postLogoutRedirectUrl,
  });
  res.redirect(endSessionUrl.href);
});

router.post("/mobile-auth/token-exchange", async (req, res): Promise<void> => {
  const parsed = ExchangeMobileAuthorizationCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required parameters" });
    return;
  }
  try {
    const config = await getOidcConfig();
    const { code, code_verifier, redirect_uri, state, nonce } = parsed.data;
    const callbackUrl = new URL(redirect_uri);
    callbackUrl.searchParams.set("code", code);
    callbackUrl.searchParams.set("state", state);
    callbackUrl.searchParams.set("iss", ISSUER_URL);
    const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: code_verifier,
      expectedNonce: nonce ?? undefined,
      expectedState: state,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims) {
      res.status(401).json({ error: "No claims in ID token" });
      return;
    }
    const dbUser = await upsertUser(claims as unknown as Record<string, unknown>);
    const now = Math.floor(Date.now() / 1000);
    const sid = await createSession({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        profileImageUrl: dbUser.profileImageUrl,
      },
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
    });
    res.json(ExchangeMobileAuthorizationCodeResponse.parse({ token: sid }));
  } catch (error) {
    req.log.error(safeErrorMetadata(error), "Mobile token exchange failed");
    res.status(500).json({ error: "Token exchange failed" });
  }
});

router.post("/mobile-auth/logout", async (req, res): Promise<void> => {
  const sid = getSessionId(req);
  if (sid) await deleteSession(sid);
  res.json(LogoutMobileSessionResponse.parse({ success: true }));
});

export default router;