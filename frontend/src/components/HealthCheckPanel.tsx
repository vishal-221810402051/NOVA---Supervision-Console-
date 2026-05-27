import { useTelemetryStore } from "../store/telemetryStore";
import { evaluateV1HealthCheck } from "../state/healthCheckEngine";

export function HealthCheckPanel() {
  const registry = useTelemetryStore((s) => s.deviceRegistry);
  const isTelemetryStale = useTelemetryStore((s) => s.isTelemetryStale);

  const result = evaluateV1HealthCheck(registry, isTelemetryStale);

  return (
    <section className="border border-slate-800 bg-slate-950 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-cyan-300">
            V1 Health Check
          </h2>
          <p className="text-xs uppercase tracking-widest text-slate-500">
            Deterministic PASS / FAIL validation panel
          </p>
        </div>

        <div className={`border px-5 py-3 font-mono text-xl font-bold ${resultClass(result.overall)}`}>
          {result.overall}
        </div>
      </div>

      <div className="grid gap-2">
        {result.rules.map((rule) => (
          <div
            key={rule.rule_id}
            className="grid grid-cols-[180px_260px_1fr] items-center border border-slate-800 bg-slate-900 p-3 text-xs"
          >
            <div className={resultClass(rule.result)}>{rule.result}</div>
            <div className="font-semibold text-cyan-100">{rule.label}</div>
            <div className="text-slate-400">{rule.details}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function resultClass(result: string) {
  if (result === "PASS") return "border-emerald-500 text-emerald-300";
  if (result === "WARNING") return "border-amber-500 text-amber-300";
  return "border-red-500 text-red-300";
}
