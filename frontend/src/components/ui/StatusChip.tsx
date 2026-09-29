import type { ReactNode } from "react";

export type StatusTone = "healthy" | "attention" | "fault" | "neutral";

type StatusChipProps = {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
};

const toneClasses: Record<StatusTone, string> = {
  healthy: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  attention: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  fault: "border-red-500/40 bg-red-500/10 text-red-200",
  neutral: "border-slate-700 bg-slate-800/70 text-slate-200",
};

export function StatusChip({
  children,
  tone = "neutral",
  className = "",
}: StatusChipProps) {
  return (
    <span
      className={`inline-flex min-w-0 items-center rounded-md border px-2.5 py-1.5 text-xs font-semibold ${toneClasses[tone]} ${className}`}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}
