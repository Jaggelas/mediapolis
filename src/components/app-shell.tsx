import { Film, History, LayoutDashboard, Settings, TimerReset } from "lucide-react";
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.25),transparent_35%),linear-gradient(180deg,#020617,#0f172a_45%,#111827)] text-white">
      <div className="flex min-h-screen w-full flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-4xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-slate-950/30 backdrop-blur">
          <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">
                Mediapolis
              </p>
              <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-300">{description}</p>
            </div>
            <div className="flex flex-col gap-3 xl:items-end">
              <nav className="flex w-full flex-wrap items-center gap-2 rounded-3xl bg-slate-950/50 p-2 xl:w-auto xl:justify-end">
                <NavLink href="/dashboard">
                  <LayoutDashboard className="h-4 w-4 shrink-0" />
                  Dashboard
                </NavLink>
                <NavLink href="/requests">
                  <Film className="h-4 w-4 shrink-0" />
                  Requests
                </NavLink>
                <NavLink href="/downloads">
                  <TimerReset className="h-4 w-4 shrink-0" />
                  Downloads
                </NavLink>
                <NavLink href="/history">
                  <History className="h-4 w-4 shrink-0" />
                  History
                </NavLink>
                <NavLink href="/settings">
                  <Settings className="h-4 w-4 shrink-0" />
                  Settings
                </NavLink>
              </nav>
              <div className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-200 sm:w-auto">
                <div className="font-medium">{displayName}</div>
                <div className="text-slate-400">Local network session</div>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 py-6">{children}</main>
      </div>
    </div>
  );
}
