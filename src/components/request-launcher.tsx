"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Plus, Upload, X } from "lucide-react";
import { RequestForm } from "@/src/components/request-form";
import { UploadForm } from "@/src/components/upload-form";

type LauncherMode = "request" | "upload" | null;

export function RequestLauncher() {
  const [mode, setMode] = useState<LauncherMode>(null);

  useEffect(() => {
    if (!mode) {
      document.body.style.overflow = "";
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMode(null);
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mode]);

  return (
    <>
      <section className="rounded-4xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.04))] p-5 shadow-[0_22px_55px_rgba(2,6,23,0.18)] backdrop-blur-xl sm:p-6 lg:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-sky-300">
              Request actions
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              Create requests only when you need them
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Start a fresh media request or import a magnet or torrent without leaving the active queue.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setMode("request")}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-300"
            >
              <Plus className="h-4 w-4" />
              New request
            </button>
            <button
              type="button"
              onClick={() => setMode("upload")}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/8 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/12"
            >
              <Upload className="h-4 w-4" />
              Manual import
            </button>
          </div>
        </div>
      </section>

      {mode ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/78 px-2 py-2 backdrop-blur-md sm:items-center sm:p-4"
          onClick={() => setMode(null)}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-4xl border border-white/12 bg-[linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.97))] shadow-[0_35px_120px_rgba(2,6,23,0.5)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-launcher-title"
          >
            <button
              type="button"
              onClick={() => setMode(null)}
              className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-slate-950/60 text-slate-200 transition hover:bg-slate-900"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="max-h-[92vh] overflow-y-auto px-5 pb-6 pt-5 sm:px-6 sm:pb-7 sm:pt-6">
              <div className="mb-6 pr-12">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                  {mode === "request" ? "New request" : "Manual import"}
                </p>
                <h3 id="request-launcher-title" className="mt-3 text-2xl font-semibold tracking-tight text-white">
                  {mode === "request" ? "Request a movie or show" : "Import a torrent or magnet"}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {mode === "request"
                    ? "Submit a title and let the app keep searching and organizing it automatically."
                    : "Drop in a magnet link or torrent file and route it through the same library workflow."}
                </p>
              </div>

              {mode === "request" ? (
                <RequestForm onSuccess={() => setMode(null)} surface="plain" />
              ) : (
                <UploadForm onSuccess={() => setMode(null)} surface="plain" />
              )}

              <div className="mt-6 flex items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                <span>
                  {mode === "request"
                    ? "The request will appear in the active queue immediately after creation."
                    : "Imported items still show up in the same downloads and history flows."}
                </span>
                <ArrowUpRight className="hidden h-4 w-4 shrink-0 text-slate-500 sm:block" />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
