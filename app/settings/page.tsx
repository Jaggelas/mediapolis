import { AppShell } from "@/src/components/app-shell";
import { StatusPill } from "@/src/components/status-pill";
import { prisma } from "@/src/lib/db";
import { getEnv } from "@/src/lib/env";
import { requireAdminSession } from "@/src/lib/session";

export default async function SettingsPage() {
  const session = await requireAdminSession();
  const env = getEnv();
  const indexers = await prisma.indexerProfile.findMany({
    orderBy: { createdAt: "asc" },
  });

  const checks = [
    { label: "Jackett API key", value: env.JACKETT_API_KEY ? "Configured" : "Missing" },
    { label: "TMDB API key", value: env.TMDB_API_KEY ? "Configured" : "Missing" },
    { label: "OpenAI API key", value: env.OPENAI_API_KEY ? "Configured" : "Missing" },
    { label: "Auto-downloads", value: env.ALLOW_AUTO_DOWNLOADS ? "Enabled" : "Disabled" },
  ];

  return (
    <AppShell
      title="Settings"
      description="Review runtime wiring for Docker volumes, lawful indexers, AI scoring, and qBittorrent connectivity."
      displayName={session.displayName}
    >
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h2 className="text-xl font-semibold text-white">Runtime configuration</h2>
          <div className="mt-5 grid gap-3">
            {checks.map((check) => (
              <div
                key={check.label}
                className="flex items-center justify-between rounded-3xl border border-white/10 bg-slate-950/40 px-4 py-4"
              >
                <div className="text-sm text-slate-300">{check.label}</div>
                <StatusPill value={check.value === "Configured" || check.value === "Enabled" ? "COMPLETED" : "FAILED"} />
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300">
            <p>Downloads path: {env.DOWNLOADS_INCOMING_DIR}</p>
            <p className="mt-2">Plex movies path: {env.PLEX_MOVIES_DIR}</p>
            <p className="mt-2">Plex TV path: {env.PLEX_TV_DIR}</p>
            <p className="mt-2">Auto-download threshold: {env.AUTO_DOWNLOAD_THRESHOLD}</p>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Indexer profiles</h2>
              <p className="mt-1 text-sm text-slate-300">
                Profiles stored in PostgreSQL for the worker scheduler.
              </p>
            </div>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Sign out
              </button>
            </form>
          </div>

          <div className="mt-5 grid gap-3">
            {indexers.map((indexer) => (
              <article
                key={indexer.id}
                className="rounded-3xl border border-white/10 bg-slate-950/40 p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-white">{indexer.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{indexer.indexerKey}</p>
                  </div>
                  <StatusPill value={indexer.enabled ? "COMPLETED" : "FAILED"} />
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
