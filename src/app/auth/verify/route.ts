import { NextResponse, type NextRequest } from "next/server";
import { consumeLoginToken, startSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const email = token ? await consumeLoginToken(token) : null;
  if (!email) return NextResponse.redirect(new URL("/login?error=invalid", req.url));
  await startSession(email);
  return NextResponse.redirect(new URL("/", req.url));
}
