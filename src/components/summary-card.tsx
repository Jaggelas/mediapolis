type SummaryCardProps = {
  label: string;
  value: string | number;
  hint: string;
};

export function SummaryCard({ label, value, hint }: SummaryCardProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <p className="text-sm font-medium text-slate-300">{label}</p>
      <p className="mt-3 text-4xl font-semibold text-white">{value}</p>
      <p className="mt-3 text-sm text-slate-400">{hint}</p>
    </div>
  );
}
