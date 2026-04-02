import { AppShell } from "@/src/components/app-shell";
import { StatusPill } from "@/src/components/status-pill";
import { SummaryCard } from "@/src/components/summary-card";
import { prisma } from "@/src/lib/db";
import { getDashboardSnapshot } from "@/src/lib/request-service";
import { requireSession } from "@/src/lib/session";
import { formatRelativeDate } from "@/src/lib/utils";

export default async function DashboardPage() {
  const session = await requireSession();
  const [summary, recentRequests, recentDownloads] = await Promise.all([
    getDashboardSnapshot(),
    prisma.mediaRequest.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: { requestedBy: true },
    }),
    prisma.downloadJob.findMany({
      take: 6,
      orderBy: { updatedAt: "desc" },
      include: { request: true },
    }),
  ]);

  return (
    <AppShell
      title="Dashboard"
      description="Track request activity, review queues, and current download movement from a single responsive control room."
      displayName={session.displayName}
    >
      <div className="grid gap-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Total requests" value={summary.requests} hint="All request records in PostgreSQL" />
          <SummaryCard label="Active downloads" value={summary.downloads} hint="Currently syncing with qBittorrent" />
          <SummaryCard label="Needs review" value={summary.reviewCount} hint="AI confidence fell below your threshold" />
          <SummaryCard label="Failed items" value={summary.failedCount} hint="Requests that need admin attention" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Recent requests</h2>
              <span className="text-sm text-slate-400">Last 6 submissions</span>
            </div>
            <div className="mt-5 overflow-hidden rounded-3xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRequests.map((request) => (
                    <tr key={request.id} className="border-t border-white/10">
                      <td className="px-4 py-4 text-white">{request.title}</td>
                      <td className="px-4 py-4 text-slate-300">{request.requestedBy.displayName}</td>
                      <td className="px-4 py-4">
                        <StatusPill value={request.status} />
                      </td>
                      <td className="px-4 py-4 text-slate-400">{formatRelativeDate(request.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Download activity</h2>
              <span className="text-sm text-slate-400">Last 6 updates</span>
            </div>
            <div className="mt-5 grid gap-3">
              {recentDownloads.map((job) => (
                <article key={job.id} className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-white">
                        {job.request?.title ?? job.inputName ?? "Unnamed import"}
                      </h3>
                      <p className="mt-1 text-sm text-slate-400">
                        {Math.round((job.progress ?? 0) * 100)}% complete
                      </p>
                    </div>
                    <StatusPill value={job.status} />
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
