import { NextResponse, type NextRequest } from "next/server";
import { vivaWebhookKey } from "@/lib/payments/providers";
import { confirmVivaTransaction } from "@/lib/payments/viva-confirm";

/** Viva verifies the URL with a GET and expects { Key } from "Retrieve webhook key". */
export async function GET() {
  try {
    return NextResponse.json({ Key: await vivaWebhookKey() });
  } catch (err) {
    console.error("[viva webhook] key", err);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}

/**
 * Transaction Payment Created (EventTypeId 1796). Record fast and return 200; the Elorus
 * invoice runs as a background job. Any non-2xx makes Viva retry (about hourly, 23 times).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { EventTypeId?: number; EventData?: { TransactionId?: string } } | null;
  if (!body || body.EventTypeId !== 1796 || !body.EventData?.TransactionId) {
    return NextResponse.json({ ignored: true });
  }
  const transactionId = body.EventData.TransactionId;
  try {
    const r = await confirmVivaTransaction(transactionId, { webhookEventId: `1796:${transactionId}` });
    return NextResponse.json(r.ok ? { outcome: r.outcome } : { ignored: r.reason });
  } catch (err) {
    console.error("[viva webhook]", err);
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }
}
