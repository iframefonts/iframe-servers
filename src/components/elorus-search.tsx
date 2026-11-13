"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { linkElorusContact, searchElorus } from "@/app/(admin)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type Result = Awaited<ReturnType<typeof searchElorus>>[number];

/** Debounced Elorus contact search with skeleton rows while it loads (HIG: show something as soon as possible). */
export function ElorusSearch({ existingClientId }: { existingClientId?: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linking, start] = useTransition();
  const router = useRouter();

  const active = q.trim().length >= 2;
  useEffect(() => {
    if (!active) return;
    const h = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await searchElorus(q));
        setError(null);
      } catch {
        setError("Couldn't reach Elorus. Check the connection in Settings and try again.");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(h);
  }, [q, active]);

  const link = (id: string) =>
    start(async () => {
      const r = await linkElorusContact(id, existingClientId);
      if (r.ok && r.clientId) {
        toast.success(r.message);
        router.push(`/clients/${r.clientId}`);
      } else toast.error(r.message);
    });

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, ΑΦΜ or email"
          aria-label="Search Elorus contacts by name, ΑΦΜ or email"
          className="h-11 pl-9 text-base"
        />
      </div>
      <div className="mt-3" aria-live="polite">
        {loading && (
          <div className="space-y-2" aria-label="Searching Elorus">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        )}
        {!loading && error && <p className="text-sm text-destructive">{error}</p>}
        {active && !loading && results && results.length === 0 && (
          <p className="text-sm text-muted-foreground">No Elorus contact matches “{q}”. Create it below.</p>
        )}
        {active && !loading && results && results.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {results.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{r.name}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {[r.vatNumber && `ΑΦΜ ${r.vatNumber}`, r.emails[0], r.isCompany ? "Business" : "Individual"].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {r.linkedClientId ? (
                  <Link href={`/clients/${r.linkedClientId}`} className="text-sm text-primary hover:underline">
                    Already added
                  </Link>
                ) : (
                  <Button size="sm" onClick={() => link(r.id)} disabled={linking}>
                    {existingClientId ? "Link" : "Add"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
