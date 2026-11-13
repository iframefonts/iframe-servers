import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "ifs_session";
const SESSION_DAYS = 30;
const LINK_MINUTES = 15;

const key = () => {
  if (env.sessionSecret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters (openssl rand -hex 32)");
  return new TextEncoder().encode(env.sessionSecret);
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export function isAllowed(email: string) {
  return env.allowedEmails.includes(email.trim().toLowerCase());
}

/** Creates a one-time login link. Returns null for addresses not on the allow-list. */
export async function createLoginLink(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!isAllowed(normalized)) return null;
  const token = randomBytes(32).toString("base64url");
  await db.loginToken.create({
    data: { email: normalized, tokenHash: hash(token), expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000) },
  });
  return `${env.appUrl}/auth/verify?token=${token}`;
}

/** Consumes a login token. Returns the email or null if invalid, used, or expired. */
export async function consumeLoginToken(token: string): Promise<string | null> {
  const row = await db.loginToken.findUnique({ where: { tokenHash: hash(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date() || !isAllowed(row.email)) return null;
  const used = await db.loginToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  return used.count === 1 ? row.email : null;
}

export async function startSession(email: string) {
  const jwt = await new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key());
  (await cookies()).set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure: env.appUrl.startsWith("https"),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export const getSession = cache(async (): Promise<{ email: string } | null> => {
  const jwt = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!jwt) return null;
  try {
    const { payload } = await jwtVerify(jwt, key());
    const email = String(payload.email ?? "");
    return isAllowed(email) ? { email } : null;
  } catch {
    return null;
  }
});

/** Use at the top of every admin page and server action. */
export async function requireUser() {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}
