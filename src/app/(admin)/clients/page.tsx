import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { LinkButton } from "@/components/link-button";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { missingInvoiceDetails } from "@/lib/elorus/client";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const unlinkedOnly = sp.filter === "unlinked";
  const clients = await db.client.findMany({
    where: unlinkedOnly
      ? { elorusContactId: null }
      : q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { vatNumber: { contains: q } },
            { emails: { has: q.toLowerCase() } },
            { websites: { some: { domain: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : undefined,
    include: { websites: true, packages: { select: { status: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="Client details come from Elorus. Edit them there; refresh here."
        actions={
          <LinkButton href="/clients/new" variant="default">
            <Plus aria-hidden /> Add Client
          </LinkButton>
        }
      />
      <nav aria-label="Filter" className="mb-3 flex gap-1.5">
        {[
          ["All", "/clients", !unlinkedOnly],
          ["Not linked to Elorus", "/clients?filter=unlinked", unlinkedOnly],
        ].map(([label, href, on]) => (
          <Link
            key={String(href)}
            href={String(href)}
            aria-current={on ? "page" : undefined}
            className={on ? "rounded-full border border-foreground bg-foreground px-3 py-1 text-[13px] font-medium text-background" : "rounded-full border px-3 py-1 text-[13px] font-medium text-muted-foreground hover:text-foreground"}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form className="relative mb-4 max-w-sm" role="search">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input name="q" defaultValue={q} placeholder="Search name, ΑΦΜ, email or domain" aria-label="Search clients" className="pl-8" />
      </form>

      {clients.length === 0 ? (
        <EmptyState
          title={q ? `No clients match “${q}”` : "No clients yet"}
          body={q ? undefined : "Add your first client by searching Elorus contacts."}
          action={q ? undefined : <LinkButton href="/clients/new" variant="default">Add Client</LinkButton>}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="hidden md:table-cell">ΑΦΜ</TableHead>
                <TableHead>Websites</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Active packages</TableHead>
                <TableHead>Invoicing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => {
                const missing = missingInvoiceDetails(c);
                return (
                  <TableRow key={c.id} className="relative">
                    <TableCell className="max-w-[240px] font-medium">
                      <Link href={`/clients/${c.id}`} className="block truncate after:absolute after:inset-0">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell num">{c.vatNumber ?? "—"}</TableCell>
                    <TableCell className="max-w-[260px] truncate text-muted-foreground">{c.websites.map((w) => w.domain).join(", ") || "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell text-right num">{c.packages.filter((p) => p.status === "active").length}</TableCell>
                    <TableCell>
                      {!c.elorusContactId ? (
                        <StatusBadge status={{ label: "Not linked", tone: "action", icon: "alert" }} />
                      ) : missing.length ? (
                        <StatusBadge status={{ label: "Missing tax details", tone: "action", icon: "alert", detail: missing.join(", ") }} />
                      ) : (
                        <StatusBadge status={{ label: "Ready", tone: "done", icon: "check" }} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
