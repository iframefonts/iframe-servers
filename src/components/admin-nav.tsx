"use client";

import { CalendarClock, Inbox, Layers, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Today", icon: Inbox },
  { href: "/renewals", label: "Renewals", icon: CalendarClock },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/plans", label: "Plans", icon: Layers },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AdminNav({ attention }: { attention: number }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" || path.startsWith("/reports") : path.startsWith(href));
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-[15px] transition-colors md:min-h-9",
            isActive(href) ? "bg-foreground/[0.07] font-semibold text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
          )}
        >
          <Icon className="size-[18px] shrink-0" aria-hidden />
          <span>{label}</span>
          {href === "/" && attention > 0 && (
            <span className="ml-auto rounded-full bg-destructive px-1.5 text-xs font-semibold text-white num" aria-label={`${attention} items need attention`}>
              {attention}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
