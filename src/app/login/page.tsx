import { createElement } from "react";
import { redirect } from "next/navigation";
import { AdminEmail } from "@/emails/admin-email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLoginLink, getSession } from "@/lib/auth";
import { getMailer } from "@/lib/email/send";
import { mock } from "@/lib/env";

export const metadata = { title: "Sign In" };

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const link = await createLoginLink(email);
  if (link) {
    let sent = true;
    try {
      await getMailer().send({
        to: [email],
        subject: "Your iFRAME Servers sign-in link",
        react: createElement(AdminEmail, {
          title: "Sign in to iFRAME Servers",
          intro: "This link works once and expires in 15 minutes.",
          actionUrl: link,
          actionLabel: "Sign In",
        }),
      });
    } catch (err) {
      console.error("[login] email failed", err);
      sent = false;
    }
    const dev = process.env.NODE_ENV !== "production";
    if (dev && (mock.email || !sent)) redirect(`/login?sent=1&dev=${encodeURIComponent(link)}${sent ? "" : "&mailfail=1"}`);
    if (!sent) redirect("/login?error=mail");
  }
  // Same answer whether or not the address is allowed, so the allow-list isn't revealed.
  redirect("/login?sent=1");
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getSession()) redirect("/");
  const sp = await searchParams;
  const sent = sp.sent === "1";
  const dev = typeof sp.dev === "string" ? sp.dev : null;
  const error = sp.error === "invalid";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-[28px] font-semibold">iFRAME Servers</h1>
        {sent ? (
          <div className="mt-4 space-y-3 text-[15px]">
            <p>Check your email. If the address is on the team list, a sign-in link is on its way.</p>
            {dev && (
              <p className="rounded-lg border bg-warning/10 p-3 text-sm">
                {sp.mailfail ? "Email couldn't be sent (check Resend)." : "Test mode, email isn't sent."}{" "}
                <a className="font-medium text-primary underline" href={dev}>
                  Open the sign-in link
                </a>
              </p>
            )}
            <a href="/login" className="text-sm text-muted-foreground underline">
              Use a different email
            </a>
          </div>
        ) : (
          <form action={sendLink} className="mt-6 space-y-4">
            {error && <p className="text-sm text-destructive">That link has expired or was already used. Request a new one.</p>}
            {sp.error === "mail" && <p className="text-sm text-destructive">The sign-in email couldn&apos;t be sent. Check the email settings, then try again.</p>}
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@iframe.gr" className="h-11 text-base" />
            </div>
            <Button type="submit" className="h-11 w-full text-[15px]">
              Email Me a Sign-In Link
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
