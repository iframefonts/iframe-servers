import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpElorus } from "@/lib/elorus/client";

/**
 * Elorus ignores `?client=` when the id isn't one of its numeric contact ids and returns
 * every invoice in the organization (seen with a client linked to a mock contact).
 */
const orgInvoices = [
  { id: "1", client: "111", sequence_flat: "ΤΠΥ 1", date: "2026-11-01", total: "124.00", paid: "124.00", payable: "0.00", status: "paid" },
  { id: "2", client: "222", sequence_flat: "ΤΠΥ 2", date: "2026-11-02", total: "248.00", paid: "0.00", payable: "248.00", status: "issued" },
];

function stubElorus(results: unknown[]) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ count: results.length, results }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("HttpElorus.listInvoices", () => {
  it("never asks Elorus for a contact id that isn't an Elorus id", async () => {
    const fetchMock = stubElorus(orgInvoices);
    expect(await new HttpElorus().listInvoices("mock-1005")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps only the contact's own invoices, even if Elorus ignores the filter", async () => {
    stubElorus(orgInvoices);
    const list = await new HttpElorus().listInvoices("111");
    expect(list.map((i) => i.id)).toEqual(["1"]);
  });
});
