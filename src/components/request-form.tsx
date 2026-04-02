"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RequestForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(formData: FormData) {
    setLoading(true);
    setError("");

    const response = await fetch("/api/requests", {
      method: "POST",
      body: JSON.stringify({
        title: formData.get("title"),
        mediaType: formData.get("mediaType"),
        year: formData.get("year") ? Number(formData.get("year")) : undefined,
        notes: formData.get("notes"),
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    setLoading(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Failed to create request.");
      return;
    }

    router.refresh();
  }

  return (
    <form
      action={onSubmit}
      className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur"
    >
      <div>
        <h2 className="text-lg font-semibold text-white">Request media</h2>
        <p className="mt-1 text-sm text-slate-300">
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
        className="inline-flex items-center justify-center rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Submitting..." : "Create request"}
      </button>
    </form>
  );
}
