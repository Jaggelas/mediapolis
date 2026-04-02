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
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition",
        active
          ? "bg-white text-slate-950 shadow-sm"
          : "text-slate-300 hover:bg-white/10 hover:text-white",
      )}
    >
      {children}
    </Link>
  );
}
