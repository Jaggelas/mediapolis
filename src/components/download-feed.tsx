"use client";

import { useEffect, useState } from "react";
import { StatusPill } from "@/src/components/status-pill";
import { formatPercent } from "@/src/lib/utils";

type DownloadFeedItem = {
  id: string;
  requestId?: string | null;
  title: string;
  status: string;
  progress: number;
  updatedAt: string;
  path?: string | null;
  errorMessage?: string | null;
};

function sortDownloadFeedItems(items: DownloadFeedItem[]) {
  return [...items].sort((left, right) => {
    if (left.status === "FAILED" && right.status !== "FAILED") {
      return -1;
    }

    if (right.status === "FAILED" && left.status !== "FAILED") {
      return 1;
    }

    if (right.progress !== left.progress) {
      return right.progress - left.progress;
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

export function DownloadFeed({ initialItems }: { initialItems: DownloadFeedItem[] }) {
  const [items, setItems] = useState(() => sortDownloadFeedItems(initialItems));
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function cancelDownload(itemId: string) {
    setActionError(null);
    setCancellingId(itemId);

    try {
      const response = await fetch(`/api/downloads/${encodeURIComponent(itemId)}/cancel`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to cancel the download.");
      }

      setItems((previousItems) => previousItems.filter((item) => item.id !== itemId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected cancel error.";
      setActionError(message);
    } finally {
      setCancellingId(null);
    }
  }

  useEffect(() => {
    const source = new EventSource("/api/stream/downloads");

    source.onmessage = (event) => {
      try {
        const nextItems = JSON.parse(event.data) as DownloadFeedItem[];
        setItems(sortDownloadFeedItems(nextItems));
      } catch {
        // Ignore malformed events and keep the last good snapshot.
      }
    };

    return () => source.close();
  }, []);

  return (
    <div className="grid gap-4">
      {items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/20 px-5 py-8 text-center text-sm text-slate-400">
          No qBittorrent downloads are currently visible for Mediapolis.
        </div>
      ) : null}
      {actionError ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {actionError}
        </div>
      ) : null}
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-4xl border border-white/10 bg-white/[0.07] p-5 shadow-[0_18px_40px_rgba(2,6,23,0.18)] backdrop-blur-xl"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-white">{item.title}</h3>
              <p className="mt-1 break-all text-sm text-slate-400 hidden sm:block">
                {item.path ?? "Waiting for qBittorrent path"}
              </p>
              {item.errorMessage ? (
                <p className="mt-2 text-sm text-rose-300">{item.errorMessage}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <StatusPill value={item.status} />
              <button
                type="button"
                onClick={() => cancelDownload(item.id)}
                disabled={cancellingId === item.id}
                className="rounded-full border border-rose-400/25 bg-rose-400/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-200 transition hover:border-rose-400/35 hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-60 sm:text-xs"
              >
                {cancellingId === item.id ? "Cancelling..." : "Cancel"}
              </button>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-slate-300">
              <span>Progress</span>
              <span>{formatPercent(item.progress)}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white/10">
              <div
                className="h-2 rounded-full bg-sky-400 transition-all"
                style={{ width: `${Math.max(3, item.progress * 100)}%` }}
              />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
