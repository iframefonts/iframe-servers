import { AdminNav } from "@/components/admin-nav";
import { requireUser } from "@/lib/auth";
import { mock } from "@/lib/env";
import { getAttention } from "@/lib/queries";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const attention = await getAttention();
  const mocks = Object.entries(mock).filter(([, v]) => v).map(([k]) => k);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr]">
      <div className="border-b bg-sidebar md:border-r md:border-b-0">
      <aside className="px-3 py-3 md:sticky md:top-0 md:h-screen md:px-3 md:py-5">
        <div className="mb-3 hidden px-3 md:block">
          <p className="text-[15px] font-semibold tracking-tight">iFRAME Servers</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <AdminNav attention={attention.items.length} />
        <form action="/auth/logout" method="post" className="mt-6 hidden px-3 md:block">
          <button className="text-sm text-muted-foreground hover:text-foreground">Sign Out</button>
        </form>
      </aside>
      </div>
      <div className="min-w-0">
        {mocks.length > 0 && (
          <p className="border-b bg-warning/10 px-6 py-2 text-[13px] text-foreground">
            Test mode: {mocks.join(", ")} {mocks.length === 1 ? "is" : "are"} simulated. No real emails, charges or invoices.
          </p>
        )}
        <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 md:px-10 md:py-8">{children}</main>
      </div>
    </div>
  );
}
