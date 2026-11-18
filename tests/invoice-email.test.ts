import { describe, expect, it } from "vitest";
import { invoiceEmail } from "@/lib/invoices/issue";

describe("invoiceEmail", () => {
  it("calls an ΑΠΥ a receipt", () => {
    expect(invoiceEmail("el", "APY").subject("028", "sinqlo.com")).toBe("Απόδειξη 028 · Ανανέωση φιλοξενίας sinqlo.com");
    expect(invoiceEmail("en", "APY").subject("028", "sinqlo.com")).toBe("Receipt 028 · Hosting renewal sinqlo.com");
    expect(invoiceEmail("en", "APY").message("sinqlo.com")).toContain("Your receipt is attached");
  });

  it("calls a ΤΠΥ an invoice", () => {
    expect(invoiceEmail("el", "TPY").subject("140", "acme.gr")).toBe("Τιμολόγιο 140 · Ανανέωση φιλοξενίας acme.gr");
    expect(invoiceEmail("en", "TPY").subject("140", "acme.gr")).toBe("Invoice 140 · Hosting renewal acme.gr");
  });
});
