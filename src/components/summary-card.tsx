type SummaryCardProps = {
  label: string;
  value: string | number;
  hint: string;
};

export function SummaryCard({ label, value, hint }: SummaryCardProps) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 shadow-[0_18px_40px_rgba(2,6,23,0.2)] backdrop-blur sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400 sm:text-xs">
        {label}
      </p>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{value}</p>
      <p className="mt-3 max-w-xs text-sm leading-6 text-slate-400">{hint}</p>
    </div>
  );
}
