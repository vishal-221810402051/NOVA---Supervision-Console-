import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: ReactNode;
  supportingText?: ReactNode;
  className?: string;
};

export function MetricCard({
  label,
  value,
  supportingText,
  className = "",
}: MetricCardProps) {
  return (
    <div className={`min-w-0 rounded-md bg-slate-900/80 p-4 ${className}`}>
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className="mt-1 min-w-0 break-words text-lg font-semibold text-slate-100">
        {value}
      </div>
      {supportingText && (
        <div className="mt-1 break-words text-xs text-slate-500">{supportingText}</div>
      )}
    </div>
  );
}
