type Props = {
  label: string;
  state: string;
};

export function StatusBadge({ label, state }: Props) {
  const color =
    state === "HEALTHY" || state === "CONNECTED" || state === "ACTIVE" || state === "DETECTED"
      ? "border-emerald-500 text-emerald-300 bg-emerald-950/40"
      : state === "UNKNOWN" ||
          state === "DEGRADED" ||
          state === "NOT_VALIDATED" ||
          state === "VALIDATION_DISABLED" ||
          state === "DETECTED_UNCONFIRMED" ||
          state === "BUS_NOT_READY" ||
          state.includes("BLOCKED")
        ? "border-amber-500 text-amber-300 bg-amber-950/40"
        : "border-red-500 text-red-300 bg-red-950/40";

  return (
    <div className={`border px-3 py-2 ${color}`}>
      <div className="text-[10px] uppercase tracking-widest text-slate-400">{label}</div>
      <div className="text-sm font-semibold">{state}</div>
    </div>
  );
}
