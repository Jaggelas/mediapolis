import { Compass, Film, History, LayoutDashboard, Settings, TimerReset } from "lucide-react";
import { NavLink } from "@/src/components/nav-link";

type AppShellProps = {
  children: React.ReactNode;
  title: string;
  description: string;
  displayName: string;
};

export function AppShell({
  children,
  title,
  description,
  displayName,
}: AppShellProps) {
  return (
    <div className="relative min-h-screen overflow-x-clip text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-112 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.2),transparent_42%)]" />
      <div className="pointer-events-none absolute -right-40 top-24 -z-10 h-72 w-72 rounded-full bg-indigo-500/18 blur-3xl" />
      <div className="pointer-events-none absolute -left-32 top-52 -z-10 h-64 w-64 rounded-full bg-sky-400/12 blur-3xl" />

      <div className="flex min-h-screen w-full flex-col px-2 pb-8 pt-3 sm:px-3 sm:pt-4">
        <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/6 p-4 shadow-[0_24px_80px_rgba(2,6,23,0.32)] backdrop-blur-xl sm:p-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(135deg,rgba(56,189,248,0.14),transparent_55%)]" />
          <div className="pointer-events-none absolute -right-8 top-0 h-24 w-24 rounded-full bg-white/10 blur-2xl" />

          <div className="relative grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.38em] text-sky-300 sm:text-xs">
                Mediapolis
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                {title}
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-400">
                {description}
              </p>
            </div>

            <div className="flex flex-col gap-3 xl:items-end">
              <nav className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-slate-950/30 p-1.5 sm:flex sm:snap-x sm:items-center sm:gap-2 sm:overflow-x-auto sm:[-ms-overflow-style:none] sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden xl:flex-wrap xl:overflow-visible">
                <NavLink href="/dashboard">
                  <LayoutDashboard className="h-4 w-4 shrink-0" />
                  <span className="sr-only sm:not-sr-only">Dashboard</span>
                </NavLink>
                <NavLink href="/requests">
                  <Film className="h-4 w-4 shrink-0" />
                  <span className="sr-only sm:not-sr-only">Requests</span>
                </NavLink>
                <NavLink href="/browse">
                  <Compass className="h-4 w-4 shrink-0" />
                  <span className="sr-only sm:not-sr-only">Browse</span>
                </NavLink>
                <NavLink href="/downloads">
                  <TimerReset className="h-4 w-4 shrink-0" />
                  <span className="sr-only sm:not-sr-only">Downloads</span>
                </NavLink>
                <NavLink href="/history">
                  <History className="h-4 w-4 shrink-0" />
                  <span className="sr-only sm:not-sr-only">History</span>
                </NavLink>
                <NavLink href="/settings">
                  <Settings className="h-4 w-4 shrink-0" />
                  <span className="sr-only sm:not-sr-only">Settings</span>
                </NavLink>
              </nav>

              <div className="inline-flex items-center gap-3 self-start rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-200 shadow-inner shadow-black/10 xl:self-auto">
                <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Signed in
                </div>
                <div className="h-1 w-1 rounded-full bg-emerald-300" />
                <div className="font-medium text-white">{displayName}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 py-5 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
