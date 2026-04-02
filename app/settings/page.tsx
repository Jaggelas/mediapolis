import { AppShell } from "@/src/components/app-shell";
import { StatusPill } from "@/src/components/status-pill";
import { UserRole } from "@/src/generated/prisma/enums";
import { prisma } from "@/src/lib/db";
import { getEnv } from "@/src/lib/env";
import { requireAdminSession } from "@/src/lib/session";

function resolveUserNotice(userStatus?: string) {
  if (userStatus === "created") {
    return {
      tone: "success",
      title: "User added",
      body: "The new account can sign in immediately.",
    };
  }

  if (userStatus === "email-taken") {
    return {
      tone: "error",
      title: "Email already in use",
      body: "Choose a different email address for the new account.",
    };
  }

  if (userStatus === "invalid") {
    return {
      tone: "error",
      title: "Couldn't add user",
      body: "Check the form values and make sure the password is at least 8 characters.",
    };
  }

  return null;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string | string[] }>;
}) {
  const session = await requireAdminSession();
  const env = getEnv();
  const [{ user: userStatus }, indexers, users] = await Promise.all([
    searchParams,
    prisma.indexerProfile.findMany({
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const notice = resolveUserNotice(Array.isArray(userStatus) ? userStatus[0] : userStatus);

  const checks = [
    { label: "Jackett API key", value: env.JACKETT_API_KEY ? "Configured" : "Missing" },
    { label: "TMDB API key", value: env.TMDB_API_KEY ? "Configured" : "Missing" },
    { label: "OpenAI API key", value: env.OPENAI_API_KEY ? "Configured" : "Missing" },
    { label: "Auto-downloads", value: env.ALLOW_AUTO_DOWNLOADS ? "Enabled" : "Disabled" },
  ];

  return (
    <AppShell
      title="Settings"
      description="Review runtime wiring, provision user accounts, and confirm the services behind requests and downloads are ready."
      displayName={session.displayName}
    >
      <div className="grid gap-6">
        <section className="rounded-4xl border border-white/10 bg-white/[0.07] p-5 shadow-[0_22px_55px_rgba(2,6,23,0.18)] backdrop-blur-xl sm:p-6 lg:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">User management</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Add platform users who can sign in and submit media requests. Admins keep access to this
                settings area.
              </p>
            </div>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="w-full rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15 sm:w-auto"
              >
                Sign out
              </button>
            </form>
          </div>

          {notice ? (
            <div
              className={`mt-5 rounded-3xl border px-4 py-3 text-sm ${
                notice.tone === "success"
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                  : "border-rose-400/30 bg-rose-400/10 text-rose-100"
              }`}
            >
              <p className="font-semibold">{notice.title}</p>
              <p className="mt-1">{notice.body}</p>
            </div>
          ) : null}

          <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <form action="/api/users" method="post" className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/40 p-4">
              <div>
                <h3 className="text-base font-semibold text-white">Add a user</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Accounts are stored in PostgreSQL and can sign in right away.
                </p>
              </div>

              <label className="grid gap-2 text-sm text-slate-300">
                Display name
                <input
                  name="displayName"
                  type="text"
                  required
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none"
                />
              </label>

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
                  minLength={8}
                  required
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Role
                <select
                  name="role"
                  defaultValue={UserRole.USER}
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none"
                >
                  <option value={UserRole.USER}>User</option>
                  <option value={UserRole.ADMIN}>Admin</option>
                </select>
              </label>

              <button
                type="submit"
                className="rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-300"
              >
                Add user
              </button>
            </form>

            <section className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-white">Current accounts</h3>
                  <p className="mt-1 text-sm text-slate-400">{users.length} configured user{users.length === 1 ? "" : "s"}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                {users.map((user) => (
                  <article key={user.id} className="rounded-3xl border border-white/10 bg-white/4 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <h4 className="truncate font-medium text-white">{user.displayName}</h4>
                        <p className="mt-1 break-all text-sm text-slate-400">{user.email}</p>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                          user.role === UserRole.ADMIN
                            ? "bg-sky-400/15 text-sky-200"
                            : "bg-white/10 text-slate-300"
                        }`}
                      >
                        {user.role}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <section className="rounded-4xl border border-white/10 bg-white/[0.07] p-5 shadow-[0_22px_55px_rgba(2,6,23,0.18)] backdrop-blur-xl sm:p-6 lg:p-7">
          <h2 className="text-xl font-semibold text-white">Runtime configuration</h2>
          <div className="mt-5 grid gap-3">
            {checks.map((check) => (
              <div
                key={check.label}
                className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-950/40 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="text-sm text-slate-300">{check.label}</div>
                <StatusPill value={check.value === "Configured" || check.value === "Enabled" ? "COMPLETED" : "FAILED"} />
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300">
            <p className="break-all">Downloads path: {env.DOWNLOADS_INCOMING_DIR}</p>
            <p className="mt-2 break-all">Plex movies path: {env.PLEX_MOVIES_DIR}</p>
            <p className="mt-2 break-all">Plex TV path: {env.PLEX_TV_DIR}</p>
            <p className="mt-2">Auto-download threshold: {env.AUTO_DOWNLOAD_THRESHOLD}</p>
          </div>
          </section>

          <section className="rounded-4xl border border-white/10 bg-white/[0.07] p-5 shadow-[0_22px_55px_rgba(2,6,23,0.18)] backdrop-blur-xl sm:p-6 lg:p-7">
            <div>
              <h2 className="text-xl font-semibold text-white">Indexer profiles</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Profiles stored in PostgreSQL for the worker scheduler.
              </p>
            </div>

            <div className="mt-5 grid gap-3">
              {indexers.map((indexer) => (
                <article
                  key={indexer.id}
                  className="rounded-3xl border border-white/10 bg-slate-950/40 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="font-medium text-white">{indexer.name}</h3>
                      <p className="mt-1 break-all text-sm text-slate-400">{indexer.indexerKey}</p>
                    </div>
                    <StatusPill value={indexer.enabled ? "COMPLETED" : "FAILED"} />
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
