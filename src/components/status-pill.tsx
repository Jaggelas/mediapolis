import { cn } from "@/src/lib/utils";

const statusClasses: Record<string, string> = {
  REQUESTED: "bg-slate-500/15 text-slate-200 ring-slate-500/20",
  SEARCHING: "bg-sky-500/15 text-sky-200 ring-sky-500/20",
  REVIEW: "bg-amber-500/15 text-amber-200 ring-amber-500/20",
  MATCHED: "bg-indigo-500/15 text-indigo-200 ring-indigo-500/20",
  DOWNLOADING: "bg-violet-500/15 text-violet-200 ring-violet-500/20",
  ORGANIZING: "bg-cyan-500/15 text-cyan-200 ring-cyan-500/20",
  COMPLETED: "bg-emerald-500/15 text-emerald-200 ring-emerald-500/20",
  FAILED: "bg-rose-500/15 text-rose-200 ring-rose-500/20",
  CANCELLED: "bg-rose-500/15 text-rose-200 ring-rose-500/20",
  QUEUED: "bg-slate-500/15 text-slate-200 ring-slate-500/20",
  APPROVED: "bg-emerald-500/15 text-emerald-200 ring-emerald-500/20",
  AUTO_SELECTED: "bg-indigo-500/15 text-indigo-200 ring-indigo-500/20",
  REJECTED: "bg-rose-500/15 text-rose-200 ring-rose-500/20",
};

export function StatusPill({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ring-1 ring-inset",
        statusClasses[value] ?? "bg-white/10 text-white ring-white/20",
      )}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
