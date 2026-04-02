"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { debugError, debugLog } from "@/src/lib/debug-log";

type RequestFormProps = {
  onSuccess?: () => void;
  surface?: "card" | "plain";
};

export function RequestForm({ onSuccess, surface = "card" }: RequestFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(formData: FormData) {
    setLoading(true);
    setError("");

    const payload = {
      title: formData.get("title"),
      mediaType: formData.get("mediaType"),
      year: formData.get("year") ? Number(formData.get("year")) : undefined,
      notes: formData.get("notes"),
    };

    debugLog("request-form", "Submitting media request", payload);

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
      });

      setLoading(false);

      if (!response.ok) {
        const responsePayload = (await response.json().catch(() => null)) as { error?: string } | null;
        const message = responsePayload?.error ?? "Failed to create request.";

        debugError("request-form", "Media request failed", {
          status: response.status,
          message,
        });
        setError(message);
        return;
      }

      debugLog("request-form", "Media request created successfully");
      formRef.current?.reset();
      router.refresh();
      onSuccess?.();
    } catch (error) {
      setLoading(false);
      const message = error instanceof Error ? error.message : "Unexpected request error.";

      debugError("request-form", "Media request threw before completion", error);
      setError(message);
    }
  }

  return (
    <form
      ref={formRef}
      action={onSubmit}
      className={
        surface === "plain"
          ? "grid gap-5"
          : "grid gap-5 rounded-4xl border border-white/10 bg-white/[0.07] p-5 shadow-[0_22px_50px_rgba(2,6,23,0.18)] backdrop-blur-xl sm:p-6"
      }
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-sky-300">
          New request
        </p>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-white">Request media</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Submit a movie or TV request and the worker will keep checking configured lawful indexers.
        </p>
      </div>
      <label className="grid gap-2 text-sm text-slate-300">
        Title
        <input
          name="title"
          required
          placeholder="Example: Big Buck Bunny"
          className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500"
        />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm text-slate-300">
          Type
          <select
            name="mediaType"
            className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none"
            defaultValue="MOVIE"
          >
            <option value="MOVIE">Movie</option>
            <option value="SHOW">TV show</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm text-slate-300">
          Year
          <input
            name="year"
            type="number"
            min="1900"
            max="2100"
            placeholder="Optional"
            className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none placeholder:text-slate-500"
          />
        </label>
      </div>
      <label className="grid gap-2 text-sm text-slate-300">
        Notes
        <textarea
          name="notes"
          rows={3}
          placeholder="Optional quality notes or episode details."
          className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none placeholder:text-slate-500"
        />
      </label>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-full items-center justify-center rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {loading ? "Submitting..." : "Create request"}
      </button>
    </form>
  );
}
