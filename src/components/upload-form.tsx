"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { debugError, debugLog } from "@/src/lib/debug-log";

export function UploadForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(formData: FormData) {
    setLoading(true);
    setError("");

    debugLog("upload-form", "Submitting manual import", {
      requestTitle: formData.get("requestTitle"),
      hasMagnetUri: Boolean(String(formData.get("magnetUri") ?? "").trim()),
      torrentFileName:
        formData.get("torrentFile") instanceof File ? (formData.get("torrentFile") as File).name : null,
    });

    try {
      const response = await fetch("/api/uploads/torrent", {
        method: "POST",
        body: formData,
      });

      setLoading(false);

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        const message = payload?.error ?? "Failed to submit upload.";

        debugError("upload-form", "Manual import failed", {
          status: response.status,
          message,
        });
        setError(message);
        return;
      }

      debugLog("upload-form", "Manual import created successfully");
      router.refresh();
    } catch (error) {
      setLoading(false);
      const message = error instanceof Error ? error.message : "Unexpected upload error.";

      debugError("upload-form", "Manual import threw before completion", error);
      setError(message);
    }
  }

  return (
    <form
      action={onSubmit}
      className="grid gap-5 rounded-4xl border border-white/10 bg-white/[0.07] p-5 shadow-[0_22px_50px_rgba(2,6,23,0.18)] backdrop-blur-xl sm:p-6"
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-violet-300">
          Manual import
        </p>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-white">
          Import torrent or magnet
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Upload a torrent file or paste a magnet link and the app will identify, download, and place it into the Plex folder layout.
        </p>
      </div>
      <label className="grid gap-2 text-sm text-slate-300">
        Friendly title
        <input
          name="requestTitle"
          placeholder="Optional override title"
          className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none placeholder:text-slate-500"
        />
      </label>
      <label className="grid gap-2 text-sm text-slate-300">
        Magnet URI
        <textarea
          name="magnetUri"
          rows={3}
          placeholder="magnet:?xt=urn:btih:..."
          className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none placeholder:text-slate-500"
        />
      </label>
      <label className="grid gap-2 text-sm text-slate-300">
        Torrent file
        <input
          name="torrentFile"
          type="file"
          accept=".torrent"
          className="rounded-2xl border border-dashed border-white/15 bg-slate-950/70 px-4 py-3 text-white file:mr-4 file:rounded-full file:border-0 file:bg-sky-400 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-950"
        />
      </label>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-full items-center justify-center rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {loading ? "Submitting..." : "Import"}
      </button>
    </form>
  );
}
