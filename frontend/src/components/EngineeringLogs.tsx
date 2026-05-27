import { useTelemetryStore } from "../store/telemetryStore";

export function EngineeringLogs() {
  const logs = useTelemetryStore((s) => s.logs);

  return (
    <section className="border border-slate-800 bg-black p-4">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-cyan-300">
        Engineering Logs
      </h2>

      <div className="max-h-64 overflow-y-auto font-mono text-xs">
        {logs.map((log) => (
          <div key={`${log.event_type}-${log.sequence_number}-${log.timestamp_utc}`} className="border-b border-slate-900 py-2">
            <span className="text-slate-500">{log.timestamp_utc}</span>{" "}
            <span
              className={
                log.severity === "CRITICAL" || log.severity === "ERROR"
                  ? "text-red-300"
                  : log.severity === "WARNING"
                    ? "text-amber-300"
                    : "text-emerald-300"
              }
            >
              {log.severity}
            </span>{" "}
            <span className="text-cyan-300">{log.node_id}</span>{" "}
            <span className="text-amber-300">{log.event_type}</span>{" "}
            <span className="text-slate-400">seq={log.sequence_number}</span>
            <span className="text-slate-500"> {log.message}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
