"use client";

import { useEffect, useState } from "react";
import { StatusPill } from "@/src/components/status-pill";
import { formatPercent } from "@/src/lib/utils";

type DownloadFeedItem = {
  id: string;
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
          No active or failed downloads right now. Finished items disappear after they are moved into the Plex library.
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
              <p className="mt-1 break-all text-sm text-slate-400">
                {item.path ?? "Waiting for qBittorrent path"}
              </p>
              {item.errorMessage ? (
                <p className="mt-2 text-sm text-rose-300">{item.errorMessage}</p>
              ) : null}
            </div>
            <StatusPill value={item.status} />
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
