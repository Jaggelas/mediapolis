import { AppShell } from "@/src/components/app-shell";
import { RequestForm } from "@/src/components/request-form";
import { StatusPill } from "@/src/components/status-pill";
import { UploadForm } from "@/src/components/upload-form";
import { RequestStatus } from "@/src/generated/prisma/enums";
import { prisma } from "@/src/lib/db";
import { requireSession } from "@/src/lib/session";
import { formatBytes, formatRelativeDate } from "@/src/lib/utils";

export default async function RequestsPage() {
  const session = await requireSession();
  const requests = await prisma.mediaRequest.findMany({
    where: {
      status: {
        notIn: [RequestStatus.COMPLETED, RequestStatus.CANCELLED],
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    include: {
      candidates: {
        orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
        take: 3,
      },
      requestedBy: true,
    },
  });

  function canCancel(status: RequestStatus) {
    return status !== RequestStatus.COMPLETED && status !== RequestStatus.CANCELLED;
  }

  return (
    <AppShell
      title="Requests"
      description="Create new requests, import manual torrents or magnets, and manage active items before they move into download or review history."
      displayName={session.displayName}
    >
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="grid gap-6">
          <RequestForm />
          <UploadForm />
        </div>

        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Active requests</h2>
              <p className="mt-1 text-sm text-slate-300">
                Only in-progress items appear here. Completed and cancelled items are moved to the History page.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {requests.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/10 px-4 py-3 text-sm text-slate-400">
                No active requests right now. Completed and cancelled items are available under History.
              </p>
            ) : null}
            {requests.map((request) => (
              <article key={request.id} className="rounded-3xl border border-white/10 bg-slate-950/40 p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
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
                  <div className="flex flex-col items-start gap-3 md:items-end">
                    <div className="text-sm text-slate-400">
                      Confidence {Math.round((request.aiConfidence ?? 0) * 100)}%
                    </div>
                    {canCancel(request.status) ? (
                      <form action={`/api/requests/${request.id}/cancel`} method="post">
                        <button
                          type="submit"
                          className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/20"
                        >
                          Cancel request
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  {request.candidates.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-white/10 px-4 py-3 text-sm text-slate-400">
                      No candidates stored yet.
                    </p>
                  ) : null}
                  {request.candidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="font-medium text-white">{candidate.title}</div>
                          <div className="mt-1 text-sm text-slate-400">
                            {formatBytes(candidate.sizeBytes)} · {candidate.seeders ?? 0} seeders
                          </div>
                          <div className="mt-2 text-sm text-slate-300">{candidate.reason}</div>
                        </div>
                        <div className="flex flex-col items-start gap-3 lg:items-end">
                          <StatusPill value={candidate.status} />
                          <div className="text-sm text-slate-300">
                            Match {Math.round((candidate.confidence ?? 0) * 100)}%
                          </div>
                          {request.status === "REVIEW" ? (
                            <form action={`/api/candidates/${candidate.id}/approve`} method="post">
                              <button
                                type="submit"
                                className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
                              >
                                Approve match
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
