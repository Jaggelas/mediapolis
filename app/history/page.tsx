import { AppShell } from "@/src/components/app-shell";
import { StatusPill } from "@/src/components/status-pill";
import { MediaType, RequestStatus } from "@/src/generated/prisma/enums";
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
      mediaFiles: {
        where: {
          mediaType: MediaType.MOVIE,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const completedCount = requests.filter((request) => request.status === RequestStatus.COMPLETED).length;
  const cancelledCount = requests.length - completedCount;
  const requesterCount = new Set(requests.map((request) => request.requestedById)).size;

  return (
    <AppShell
      title="History"
      description="Review completed and cancelled requests in one clean, scan-friendly archive."
      displayName={session.displayName}
    >
      <section className="rounded-4xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.04))] p-5 shadow-[0_22px_55px_rgba(2,6,23,0.18)] backdrop-blur-xl sm:p-6 lg:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Archive</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Closed requests live here after leaving the active queue. The layout is tuned for clear scanning on both
              desktop and mobile.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <SummaryPill label="Archived" value={requests.length} />
            <SummaryPill label="Completed" value={completedCount} tone="success" />
            <SummaryPill label="Cancelled" value={cancelledCount} tone="danger" />
            <SummaryPill label="Users" value={requesterCount} />
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          {requests.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/20 px-5 py-8 text-center">
              <p className="text-sm font-medium text-slate-300">No historical requests yet.</p>
              <p className="mt-2 text-sm text-slate-400">
                Completed and cancelled items appear here automatically once they leave your active queue.
              </p>
            </div>
          ) : null}

          {requests.map((request) => {
            const movieFile = request.mediaFiles[0] ?? null;
            const canRemoveMovieFromDisk =
              request.status === RequestStatus.COMPLETED &&
              request.mediaType === MediaType.MOVIE &&
              movieFile;

            return (
              <article
                key={request.id}
                className="rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(15,23,42,0.58))] px-4 py-4 shadow-[0_12px_28px_rgba(2,6,23,0.12)] sm:px-5"
              >
                <div className="grid gap-4">
                  <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                          {request.status === RequestStatus.COMPLETED ? "Completed" : "Cancelled"}
                        </span>
                        <h3 className="text-base font-semibold tracking-tight text-white sm:text-lg">
                          {request.title}
                          {request.year ? ` (${request.year})` : ""}
                        </h3>
                        <StatusPill value={request.status} />
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
                        <span>{request.requestedBy.displayName}</span>
                        <span className="hidden h-1 w-1 rounded-full bg-slate-600 sm:inline-block" />
                        <span>{request.mediaType === MediaType.MOVIE ? "Movie" : "TV Show"}</span>
                        <span className="hidden h-1 w-1 rounded-full bg-slate-600 sm:inline-block" />
                        <span>Updated {formatRelativeDate(request.updatedAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 lg:justify-end">
                      {movieFile ? (
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100">
                          File archived
                        </span>
                      ) : (
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                          No file stored
                        </span>
                      )}
                    </div>
                  </div>

                  {movieFile || canRemoveMovieFromDisk ? (
                    <div className="grid gap-3 border-t border-white/8 pt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                      {movieFile ? (
                        <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            File location
                          </p>
                          <p className="mt-2 break-all text-sm text-slate-300">{movieFile.destinationPath}</p>
                        </div>
                      ) : (
                        <div />
                      )}

                      {canRemoveMovieFromDisk ? (
                        <form action={`/api/requests/${request.id}/remove-movie`} method="post" className="lg:justify-self-end">
                          <button
                            type="submit"
                            className="rounded-full border border-rose-400/25 bg-rose-400/10 px-3.5 py-1.5 text-sm font-medium text-rose-200 transition hover:border-rose-400/35 hover:bg-rose-400/20"
                          >
                            Remove from disk
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}

function SummaryPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "success" | "danger";
}) {
  const toneClasses = {
    default: "border-white/10 bg-slate-950/35 text-slate-200",
    success: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
    danger: "border-rose-400/20 bg-rose-400/10 text-rose-100",
  } satisfies Record<NonNullable<typeof tone>, string>;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium sm:text-sm ${
        toneClasses[tone ?? "default"]
      }`}
    >
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}
