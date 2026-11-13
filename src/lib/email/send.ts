import { render } from "@react-email/components";
import type { ReactElement } from "react";
import { Resend } from "resend";
import { env, mock } from "@/lib/env";

export type OutgoingEmail = {
  to: string[];
  cc?: string[];
  subject: string;
  react: ReactElement;
  /** Same key → Resend sends at most once (24h window). */
  idempotencyKey?: string;
};

export type SentEmail = { id: string };

export interface Mailer {
  send(email: OutgoingEmail): Promise<SentEmail>;
}

/** Dev/test mailer: keeps the last emails in memory and logs them. */
export class MemoryMailer implements Mailer {
  sent: (OutgoingEmail & { id: string; html?: string })[] = [];
  failNext = 0;
  async send(email: OutgoingEmail) {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error("Simulated email failure");
    }
    const prior = email.idempotencyKey && this.sent.find((s) => s.idempotencyKey === email.idempotencyKey);
    if (prior) return { id: prior.id };
    const id = `dev_${Math.random().toString(36).slice(2, 10)}`;
    this.sent.push({ ...email, id });
    if (process.env.NODE_ENV !== "test") {
      console.info(`[email:mock] ${id} → ${email.to.join(", ")}${email.cc ? ` (cc ${email.cc})` : ""} · ${email.subject}`);
    }
    return { id };
  }
}

/** With EMAIL_REDIRECT_TO set, nothing reaches real clients: all mail goes to that address. */
export function applyRedirect(email: OutgoingEmail, redirectTo: string): OutgoingEmail {
  if (!redirectTo) return email;
  const original = [...email.to, ...(email.cc ?? []).map((c) => `cc ${c}`)].join(", ");
  return {
    ...email,
    to: [redirectTo],
    cc: undefined,
    subject: `[to: ${original}] ${email.subject}`,
    idempotencyKey: email.idempotencyKey ? `redirect:${email.idempotencyKey}` : undefined,
  };
}

class ResendMailer implements Mailer {
  private client = new Resend(env.resendKey);
  async send(original: OutgoingEmail) {
    const email = applyRedirect(original, env.emailRedirectTo);
    const html = await render(email.react);
    const { data, error } = await this.client.emails.send(
      { from: env.emailFrom, replyTo: env.emailReplyTo || undefined, to: email.to, cc: email.cc, subject: email.subject, html },
      email.idempotencyKey ? { idempotencyKey: email.idempotencyKey } : undefined,
    );
    if (error || !data) throw new Error(`Resend: ${error?.message ?? "no response"}`);
    return { id: data.id };
  }
}

const g = globalThis as unknown as { __mailer?: Mailer };
export function getMailer(): Mailer {
  g.__mailer ??= mock.email ? new MemoryMailer() : new ResendMailer();
  return g.__mailer;
}
export function setMailer(m: Mailer) {
  g.__mailer = m;
}
