/**
 * Elorus API client. Auth: `Authorization: Token <key>` + `X-Elorus-Organization: <org id>`.
 * Paths marked VERIFY must be confirmed against https://developer.elorus.com/ (plan, Phase 5)
 * with the Elorus test organization before going live.
 */
import { env, mock } from "@/lib/env";

export type ElorusContact = {
  id: string;
  name: string; // company or full name
  company?: string;
  vatNumber?: string;
  taxOffice?: string;
  address?: string;
  emails: string[];
  phone?: string;
  isCompany: boolean;
};

export type NewContact = Omit<ElorusContact, "id">;

export type CreateInvoiceInput = {
  contactId: string;
  documentType: string; // Elorus document type id (series) for ΤΠΥ / ΑΠΥ / intra-EU / non-EU
  date: string; // YYYY-MM-DD, the payment date
  /** One invoice line per item: hosting, plus each domain renewed with it */
  lines: { title: string; netCents: number; productId?: string | null }[];
  vatRate: number;
};

export type ElorusInvoiceSummary = { id: string; number: string; date: string; totalCents: number; paid: boolean };

export interface ElorusApi {
  searchContacts(q: string): Promise<ElorusContact[]>;
  getContact(id: string): Promise<ElorusContact>;
  createContact(c: NewContact): Promise<ElorusContact>;
  /** Creates an issued (not draft) invoice. Returns its id and number. */
  createInvoice(input: CreateInvoiceInput): Promise<{ id: string; number: string }>;
  /** Records the payment against the invoice so it shows as paid. */
  recordPayment(input: { invoiceId: string; contactId: string; amountCents: number; date: string }): Promise<void>;
  /** Emails the invoice with its PDF attached. */
  emailInvoice(input: { invoiceId: string; to: string[] }): Promise<void>;
  listInvoices(contactId: string): Promise<ElorusInvoiceSummary[]>;
  ping(): Promise<boolean>;
}

const BASE = "https://api.elorus.com/v1.1";

class HttpElorus implements ElorusApi {
  private async req<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Token ${env.elorus.token}`,
        "X-Elorus-Organization": env.elorus.orgId,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...init.headers,
      },
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 500 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, wait));
      return this.req<T>(path, init, attempt + 1);
    }
    if (!res.ok) throw new Error(`Elorus ${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  private toContact(c: Record<string, unknown>): ElorusContact {
    const emails = (c.email as { email: string }[] | undefined)?.map((e) => e.email) ?? [];
    const addr = (c.addresses as { address?: string; city?: string; zip?: string }[] | undefined)?.[0];
    const company = (c.company as string) || undefined;
    const full = [c.first_name, c.last_name].filter(Boolean).join(" ");
    return {
      id: String(c.id),
      name: company || full || String(c.display_name ?? ""),
      company,
      vatNumber: (c.vat_number as string) || undefined,
      taxOffice: (c.tax_office as string) || undefined, // VERIFY field name
      address: addr ? [addr.address, addr.zip, addr.city].filter(Boolean).join(", ") : undefined,
      emails,
      phone: (c.phones as { number: string }[] | undefined)?.[0]?.number,
      isCompany: Boolean(c.is_company ?? company),
    };
  }

  async searchContacts(q: string) {
    const data = await this.req<{ results: Record<string, unknown>[] }>(`/contacts/?search=${encodeURIComponent(q)}&page_size=20`);
    return data.results.map((c) => this.toContact(c));
  }
  async getContact(id: string) {
    return this.toContact(await this.req(`/contacts/${id}/`));
  }
  async createContact(c: NewContact) {
    const body = {
      company: c.company ?? (c.isCompany ? c.name : ""),
      first_name: c.isCompany ? "" : c.name,
      is_company: c.isCompany,
      vat_number: c.vatNumber ?? "",
      tax_office: c.taxOffice ?? "", // VERIFY
      email: c.emails.map((email, i) => ({ email, primary: i === 0 })),
      phones: c.phone ? [{ number: c.phone, primary: true }] : [],
      addresses: c.address ? [{ address: c.address, ad_type: "bill" }] : [],
    };
    return this.toContact(await this.req(`/contacts/`, { method: "POST", body: JSON.stringify(body) }));
  }
  async createInvoice(i: CreateInvoiceInput) {
    const inv = await this.req<{ id: string; sequence_flat?: string; number?: string }>(`/invoices/`, {
      method: "POST",
      body: JSON.stringify({
        client: i.contactId,
        documenttype: i.documentType,
        date: i.date,
        draft: false,
        currency_code: "EUR",
        calculator_mode: "initial",
        items: i.lines.map((l) => ({
          product: l.productId ?? undefined,
          title: l.title,
          quantity: "1",
          unit_value: (l.netCents / 100).toFixed(2),
          unit_total: (l.netCents / 100).toFixed(2),
          taxes: [], // VERIFY: tax ids for 24% / 0% exemption
        })),
      }),
    });
    return { id: String(inv.id), number: inv.sequence_flat ?? inv.number ?? String(inv.id) };
  }
  async recordPayment(p: { invoiceId: string; contactId: string; amountCents: number; date: string }) {
    // VERIFY: cash receipt endpoint and payload
    await this.req(`/cashreceipts/`, {
      method: "POST",
      body: JSON.stringify({
        contact: p.contactId,
        date: p.date,
        amount: (p.amountCents / 100).toFixed(2),
        invoices: [{ invoice: p.invoiceId, amount: (p.amountCents / 100).toFixed(2) }],
      }),
    });
  }
  async emailInvoice(p: { invoiceId: string; to: string[] }) {
    // VERIFY: invoice email endpoint
    await this.req(`/invoices/${p.invoiceId}/email/`, {
      method: "POST",
      body: JSON.stringify({ recipients: p.to, attach_pdf: true }),
    });
  }
  async listInvoices(contactId: string) {
    const data = await this.req<{ results: Record<string, unknown>[] }>(`/invoices/?client=${contactId}&page_size=50`);
    return data.results.map((r) => ({
      id: String(r.id),
      number: String(r.sequence_flat ?? r.number ?? r.id),
      date: String(r.date),
      totalCents: Math.round(Number(r.total ?? 0) * 100),
      paid: Number(r.amount_due ?? r.payable ?? 0) === 0,
    }));
  }
  async ping() {
    await this.req(`/contacts/?page_size=1`);
    return true;
  }
}

/** In-memory Elorus used when ELORUS_TOKEN is empty (dev) and in tests. */
export class MockElorus implements ElorusApi {
  contacts = new Map<string, ElorusContact>();
  invoices: (ElorusInvoiceSummary & { contactId: string; emailedTo?: string[]; lines?: CreateInvoiceInput["lines"] })[] = [];
  failNext = 0;
  private seq = 140;

  constructor(seed: ElorusContact[] = DEFAULT_MOCK_CONTACTS) {
    for (const c of seed) this.contacts.set(c.id, c);
  }
  private maybeFail() {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error("Elorus mock: simulated 503");
    }
  }
  async searchContacts(q: string) {
    const s = q.toLowerCase();
    return [...this.contacts.values()].filter((c) =>
      [c.name, c.vatNumber, ...c.emails].some((v) => v?.toLowerCase().includes(s)),
    );
  }
  async getContact(id: string) {
    this.maybeFail();
    const c = this.contacts.get(id);
    if (!c) throw new Error(`Elorus mock: contact ${id} not found`);
    return c;
  }
  async createContact(c: NewContact) {
    const contact = { ...c, id: `mock-${this.contacts.size + 1000}` };
    this.contacts.set(contact.id, contact);
    return contact;
  }
  async createInvoice(i: CreateInvoiceInput) {
    this.maybeFail();
    const id = `inv-${++this.seq}`;
    const number = `${i.documentType}-${String(this.seq).padStart(4, "0")}`;
    this.invoices.push({ id, number, date: i.date, totalCents: 0, paid: false, contactId: i.contactId, lines: i.lines });
    return { id, number };
  }
  async recordPayment(p: { invoiceId: string; amountCents: number }) {
    const inv = this.invoices.find((x) => x.id === p.invoiceId);
    if (inv) Object.assign(inv, { paid: true, totalCents: p.amountCents });
  }
  async emailInvoice(p: { invoiceId: string; to: string[] }) {
    const inv = this.invoices.find((x) => x.id === p.invoiceId);
    if (inv) inv.emailedTo = p.to;
  }
  async listInvoices(contactId: string) {
    return this.invoices.filter((i) => i.contactId === contactId);
  }
  async ping() {
    return true;
  }
}

export const DEFAULT_MOCK_CONTACTS: ElorusContact[] = [
  { id: "mock-1", name: "Biokip ΙΚΕ", company: "Biokip ΙΚΕ", vatNumber: "801234567", taxOffice: "Πρέβεζας", address: "Ελ. Βενιζέλου 12, 48100 Πρέβεζα", emails: ["info@biokip.gr"], isCompany: true },
  { id: "mock-2", name: "Ελένη Μαλλάτου", vatNumber: "123456789", emails: ["eleni@mallatou.gr"], isCompany: false },
  { id: "mock-3", name: "Petra Hotel GmbH", company: "Petra Hotel GmbH", vatNumber: "DE298765432", taxOffice: "Finanzamt München", address: "Leopoldstr. 5, 80802 München", emails: ["office@petra-hotel.de"], isCompany: true },
  { id: "mock-4", name: "Tip-Top Ο.Ε.", company: "Tip-Top Ο.Ε.", vatNumber: "998877665", emails: ["hello@tip-top.gr"], isCompany: true },
  { id: "mock-5", name: "Hotel Loukas", company: "Hotel Loukas", vatNumber: "094455667", taxOffice: "Ιωαννίνων", address: "Παραλία 3, 48060 Πάργα", emails: ["info@hotelloukas.gr"], isCompany: true },
];

const g = globalThis as unknown as { __elorus?: ElorusApi };
export function getElorus(): ElorusApi {
  g.__elorus ??= mock.elorus ? new MockElorus() : new HttpElorus();
  return g.__elorus;
}
export function setElorus(api: ElorusApi) {
  g.__elorus = api;
}

/** What Elorus must have before an invoice can be issued. Empty array = ready. */
export function missingInvoiceDetails(c: {
  invoiceType: "TPY" | "APY";
  name: string;
  vatNumber: string | null;
  taxOffice: string | null;
  address: string | null;
  emails: string[];
  elorusContactId: string | null;
}): string[] {
  const missing: string[] = [];
  if (!c.elorusContactId) missing.push("Elorus link");
  if (c.invoiceType === "TPY") {
    if (!c.vatNumber) missing.push("ΑΦΜ");
    if (!c.taxOffice) missing.push("tax office");
    if (!c.address) missing.push("address");
  } else {
    if (!c.name) missing.push("name");
  }
  if (c.emails.length === 0) missing.push("email");
  return missing;
}
