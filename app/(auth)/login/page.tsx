import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/session";

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_35%),linear-gradient(180deg,_#020617,_#111827)] px-4 py-12">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">
          Mediapolis
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-white">Sign in on your local network</h1>
        <p className="mt-3 text-sm text-slate-300">
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
            className="mt-2 rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
