import { and, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { ensureAccountSchema } from "@/lib/account-schema";

export type AccountUser = {
  displayName: string;
  email: string;
};

export type PasswordRecord = {
  hash: string;
  iterations: number;
  salt: string;
};

const encoder = new TextEncoder();
const SESSION_COOKIE = "ai_trainer_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
// Keep the work factor within the WebCrypto budget of deployed Workers. The
// per-user value is stored with the hash, so it can be raised transparently.
const PASSWORD_ITERATIONS = 100_000;
const DUMMY_SALT = "AAAAAAAAAAAAAAAAAAAAAA";

export async function getAccountUser(): Promise<AccountUser | null> {
  const requestHeaders = await headers();
  return getAccountUserFromCookie(requestHeaders.get("cookie"));
}

export async function getAccountUserFromCookie(cookieHeader: string | null): Promise<AccountUser | null> {
  const token = readSessionToken(cookieHeader);
  if (!token) return null;

  await ensureAccountSchema();
  const tokenHash = await sha256(token);
  const [user] = await getDb()
    .select({ email: users.email, displayName: users.displayName })
    .from(sessions)
    .innerJoin(users, eq(sessions.email, users.email))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date().toISOString())))
    .limit(1);

  if (!user) return null;
  return { email: user.email, displayName: user.displayName?.trim() || user.email };
}

export async function requireAccountUser(returnTo: string): Promise<AccountUser> {
  const user = await getAccountUser();
  if (user) return user;
  redirect(accountSignInPath(returnTo));
}

export function accountSignInPath(returnTo: string, mode: "login" | "register" = "login"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `/account?mode=${mode}&return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function safeRelativeReturnPath(value: string | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local" || url.pathname === "/account") return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 128;
}

export async function createPasswordRecord(password: string): Promise<PasswordRecord> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, saltBytes, PASSWORD_ITERATIONS);
  return { hash, iterations: PASSWORD_ITERATIONS, salt: encodeBase64Url(saltBytes) };
}

export async function verifyPassword(password: string, record: Partial<PasswordRecord>): Promise<boolean> {
  const salt = decodeBase64Url(record.salt || DUMMY_SALT);
  const iterations = record.iterations || PASSWORD_ITERATIONS;
  const candidate = await derivePasswordHash(password, salt, iterations);
  return Boolean(record.hash) && constantTimeEqual(candidate, record.hash!);
}

export async function createSession(email: string): Promise<{ token: string }> {
  await ensureAccountSchema();
  const token = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  await getDb().insert(sessions).values({ tokenHash, email, expiresAt });
  return { token };
}

export async function deleteSession(cookieHeader: string | null): Promise<void> {
  const token = readSessionToken(cookieHeader);
  if (!token) return;
  await ensureAccountSchema();
  await getDb().delete(sessions).where(eq(sessions.tokenHash, await sha256(token)));
}

export function serializeSessionCookie(token: string, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ].filter(Boolean).join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    "Max-Age=0",
  ].filter(Boolean).join("; ");
}

export function isSecureRequest(request: Request): boolean {
  return request.headers.get("x-forwarded-proto") === "https" || new URL(request.url).protocol === "https:";
}

function readSessionToken(cookieHeader: string | null): string | null {
  const value = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return encodeBase64Url(new Uint8Array(bits));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return encodeBase64Url(new Uint8Array(digest));
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}
