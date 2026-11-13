import Link from "next/link";
import { ElorusSearch } from "@/components/elorus-search";
import { NewContactForm } from "@/components/new-contact-form";
import { PageHeader, Section } from "@/components/page-header";

export const metadata = { title: "Add Client" };

export default function NewClientPage() {
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/clients" className="text-muted-foreground hover:text-foreground">
          ← Clients
        </Link>
      </p>
      <PageHeader title="Add Client" subtitle="Pick the client's Elorus contact. Nobody retypes tax details here, so invoices always match your books." />
      <div className="max-w-2xl">
        <Section title="Search Elorus">
          <div className="rounded-xl border bg-card p-5">
            <ElorusSearch />
          </div>
        </Section>
        <Section title="Not in Elorus yet?" description="Creates the contact in Elorus first, then adds it here.">
          <div className="rounded-xl border bg-card p-5">
            <NewContactForm />
          </div>
        </Section>
      </div>
    </>
  );
}
