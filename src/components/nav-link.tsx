"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { cn } from "@/src/lib/utils";

type NavLinkProps = {
  href: Route;
  children: React.ReactNode;
};

export function NavLink({ href, children }: NavLinkProps) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-9 shrink-0 snap-start items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-medium transition sm:shrink",
        active
          ? "border-white/70 bg-white text-slate-950 shadow-[0_8px_20px_rgba(255,255,255,0.1)]"
          : "border-white/8 bg-white/4 text-slate-300 hover:border-white/15 hover:bg-white/8 hover:text-white",
      )}
    >
      {children}
    </Link>
  );
}
