import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/session";

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-104 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.24),transparent_36%)]" />
      <div className="pointer-events-none absolute -left-28 top-24 h-56 w-56 rounded-full bg-indigo-500/18 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-40 h-64 w-64 rounded-full bg-sky-400/18 blur-3xl" />

      <div className="relative grid w-full max-w-5xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-4xl border border-white/10 bg-white/6 p-6 shadow-[0_26px_80px_rgba(2,6,23,0.42)] backdrop-blur-xl sm:p-8 lg:p-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.38em] text-sky-300 sm:text-xs">
            Mediapolis
          </p>
          <h1 className="mt-4 max-w-md text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Media requests that feel organized everywhere.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
            Review requests, track downloads, and keep your Plex workflow moving with a layout
            that stays clean on phones, tablets, and desktops.
          </p>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Responsive
              </div>
              <p className="mt-2 text-sm text-slate-200">Purpose-built for touch and wide-screen control.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Secure
              </div>
              <p className="mt-2 text-sm text-slate-200">Session-based access for local network admins.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Fast
              </div>
              <p className="mt-2 text-sm text-slate-200">Stay on top of requests without cramped layouts.</p>
            </div>
          </div>
        </section>

        <section className="rounded-4xl border border-white/10 bg-slate-950/55 p-6 shadow-[0_26px_80px_rgba(2,6,23,0.42)] backdrop-blur-xl sm:p-8 lg:p-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400">
            Local network access
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Sign in to continue
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Use the admin account seeded from your Docker environment variables.
          </p>

          <form action="/api/auth/login" method="post" className="mt-8 grid gap-4">
            <label className="grid gap-2 text-sm text-slate-300">
              Email
              <input
                name="email"
                type="email"
                required
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none"
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              Password
              <input
                name="password"
                type="password"
                required
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none"
              />
            </label>
            <button
              type="submit"
              className="mt-2 rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-300"
            >
              Sign in
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
