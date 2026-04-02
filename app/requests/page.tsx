import { AppShell } from "@/src/components/app-shell";
import { ChevronDown } from "lucide-react";
import { RequestLauncher } from "@/src/components/request-launcher";
import { StatusPill } from "@/src/components/status-pill";
import { DownloadStatus, RequestStatus } from "@/src/generated/prisma/enums";
import { prisma } from "@/src/lib/db";
import { requireSession } from "@/src/lib/session";
import { formatBytes, formatPercent, formatRelativeDate } from "@/src/lib/utils";

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
      downloads: {
        where: {
          status: {
            in: [
              DownloadStatus.QUEUED,
              DownloadStatus.MATCHED,
              DownloadStatus.DOWNLOADING,
              DownloadStatus.ORGANIZING,
            ],
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      requestedBy: true,
    },
  });

  function canCancel(status: RequestStatus) {
    return status !== RequestStatus.COMPLETED && status !== RequestStatus.CANCELLED;
  }

  function getRequestConfidenceLabel(request: (typeof requests)[number]) {
    if (request.candidates.length === 0 || request.aiConfidence == null) {
      return "Waiting for search results";
    }

    return `${Math.round(request.aiConfidence * 100)}% confidence`;
  }

  function getLatestDownload(request: (typeof requests)[number]) {
    return request.downloads[0] ?? null;
  }

  return (
    <AppShell
      title="Requests"
      description="Create new requests, import manual torrents or magnets, and manage active items before they move into download or review history."
      displayName={session.displayName}
    >
      <div className="grid gap-6">
        <RequestLauncher />
        <section className="rounded-4xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.04))] p-5 shadow-[0_22px_55px_rgba(2,6,23,0.18)] backdrop-blur-xl sm:p-6 lg:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Active requests</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Only in-progress items appear here. Completed and cancelled items are moved to the History page.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-slate-950/35 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              <span>{requests.length}</span>
              <span>Open items</span>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            {requests.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/20 px-5 py-8 text-center">
                <p className="text-sm font-medium text-slate-300">No active requests right now.</p>
                <p className="mt-2 text-sm text-slate-400">
                  Completed and cancelled items are available under History.
                </p>
              </div>
            ) : null}
            {requests.map((request) => (
              <details
                key={request.id}
                className="group rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(15,23,42,0.58))] shadow-[0_12px_28px_rgba(2,6,23,0.12)] transition hover:-translate-y-0.5 hover:border-white/15 hover:shadow-[0_18px_36px_rgba(2,6,23,0.2)]"
              >
                <summary className="list-none cursor-pointer px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200">
                          Active
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
                        <span>{formatRelativeDate(request.createdAt)}</span>
                        <span className="hidden h-1 w-1 rounded-full bg-slate-600 sm:inline-block" />
                        <span className="font-medium text-sky-200">
                          {getRequestConfidenceLabel(request)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                        {request.candidates.length} candidates
                      </div>
                      {getLatestDownload(request) ? (
                        <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100">
                          {formatPercent(getLatestDownload(request)?.progress ?? 0)} downloaded
                        </div>
                      ) : null}
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/35 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-300">
                        <span>Expand</span>
                        <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
                      </div>
                    </div>
                  </div>
                </summary>

                <div className="border-t border-white/8 px-4 pb-4 pt-4 sm:px-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-slate-400">
                      Review AI notes, download progress, and candidate matches only when needed.
                    </div>
                    {canCancel(request.status) ? (
                      <form action={`/api/requests/${request.id}/cancel`} method="post">
                        <button
                          type="submit"
                          className="rounded-full border border-rose-400/25 bg-rose-400/10 px-3.5 py-1.5 text-sm font-medium text-rose-200 transition hover:border-rose-400/35 hover:bg-rose-400/20"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : null}
                  </div>

                  {request.aiReason ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                      <p>{request.aiReason}</p>
                      {request.nextSearchAt ? (
                        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                          Next retry {formatRelativeDate(request.nextSearchAt)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {getLatestDownload(request) ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-white">Download progress</span>
                        <span className="text-sky-200">
                          {formatPercent(getLatestDownload(request)?.progress ?? 0)}
                        </span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-white/10">
                        <div
                          className="h-2 rounded-full bg-sky-400 transition-all"
                          style={{ width: `${Math.max(3, (getLatestDownload(request)?.progress ?? 0) * 100)}%` }}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                        <span>{formatBytes(getLatestDownload(request)?.bytesDownloaded ?? 0)}</span>
                        <span>/</span>
                        <span>{formatBytes(getLatestDownload(request)?.bytesTotal)}</span>
                        <span className="hidden h-1 w-1 rounded-full bg-slate-600 sm:inline-block" />
                        <span>{getLatestDownload(request)?.status ?? "DOWNLOADING"}</span>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-2">
                    {request.candidates.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 px-4 py-3 text-sm text-slate-500">
                        No candidates stored yet.
                      </div>
                    ) : null}
                    {request.candidates.map((candidate, index) => (
                      <div
                        key={candidate.id}
                        className="rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] px-4 py-3 transition hover:border-white/12 hover:bg-white/5"
                      >
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-900/80 px-2 text-[11px] font-semibold text-slate-300">
                                {index + 1}
                              </span>
                              <div className="font-medium text-white">{candidate.title}</div>
                              <StatusPill value={candidate.status} />
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
                              <span>{formatBytes(candidate.sizeBytes)}</span>
                              <span>{candidate.seeders ?? 0} seeders</span>
                              <span className="font-medium text-sky-200">
                                {Math.round((candidate.confidence ?? 0) * 100)}% match
                              </span>
                            </div>
                            <p className="mt-2 wrap-break-word text-sm text-slate-500">
                              {candidate.reason}
                            </p>
                          </div>

                          {request.status === "REVIEW" ? (
                            <form action={`/api/candidates/${candidate.id}/approve`} method="post">
                              <button
                                type="submit"
                                className="rounded-full bg-sky-400 px-3.5 py-1.5 text-sm font-semibold text-slate-950 shadow-[0_10px_24px_rgba(56,189,248,0.18)] transition hover:bg-sky-300"
                              >
                                Approve
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
