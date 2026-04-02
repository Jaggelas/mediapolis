import { AppShell } from "@/src/components/app-shell";
import { StatusPill } from "@/src/components/status-pill";
import { RequestStatus } from "@/src/generated/prisma/enums";
import { prisma } from "@/src/lib/db";
import { requireSession } from "@/src/lib/session";
import { formatRelativeDate } from "@/src/lib/utils";

export default async function HistoryPage() {
  const session = await requireSession();
  const requests = await prisma.mediaRequest.findMany({
    where: {
      status: {
        in: [RequestStatus.COMPLETED, RequestStatus.CANCELLED],
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      requestedBy: true,
      downloads: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      mediaFiles: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });

  return (
    <AppShell
      title="History"
      description="Review completed and cancelled requests after they leave the active request queue."
      displayName={session.displayName}
    >
      <section className="rounded-4xl border border-white/10 bg-white/[0.07] p-5 shadow-[0_22px_55px_rgba(2,6,23,0.18)] backdrop-blur-xl sm:p-6 lg:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Completed and cancelled</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Historical requests are kept here so the main Requests page stays focused on active work.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          {requests.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 px-4 py-3 text-sm text-slate-400">
              No historical requests yet.
            </p>
          ) : null}
          {requests.map((request) => (
            <article key={request.id} className="rounded-3xl border border-white/10 bg-slate-950/40 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-semibold text-white">
                      {request.title}
                      {request.year ? ` (${request.year})` : ""}
                    </h3>
                    <StatusPill value={request.status} />
                  </div>
                  <p className="mt-2 text-sm text-slate-400">
                    Requested by {request.requestedBy.displayName} on {formatRelativeDate(request.createdAt)}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/5 px-3 py-2 text-sm text-slate-400">
                  Updated {formatRelativeDate(request.updatedAt)}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Match confidence
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {Math.round((request.aiConfidence ?? 0) * 100)}%
                  </div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Last download status
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {request.downloads[0]?.status ?? "No download record"}
                  </div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Final destination
                  </div>
                  <div className="mt-2 break-all text-sm text-slate-200">
                    {request.mediaFiles[0]?.destinationPath ?? "No organized media file"}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
