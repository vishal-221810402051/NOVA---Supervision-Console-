import { useTelemetryStore } from "../store/telemetryStore";
import { evaluateV1PlusHealthCheck } from "../state/healthCheckEngine";
import type { HealthCheckCategory, HealthCheckRule } from "../types/telemetry";

const categories: HealthCheckCategory[] = [
  "TOPOLOGY",
  "GATEWAY",
  "LINK",
  "STREAM",
  "INTEGRITY",
  "NODE",
  "CHIP",
  "POWER",
  "EXPECTED_WARNING",
];

export function HealthCheckPanel() {
  const deviceRegistry = useTelemetryStore((s) => s.deviceRegistry);
  const linkRegistry = useTelemetryStore((s) => s.linkRegistry);
  const gatewayHealth = useTelemetryStore((s) => s.gatewayHealth);
  const connectionState = useTelemetryStore((s) => s.connectionState);
  const isTelemetryStale = useTelemetryStore((s) => s.isTelemetryStale);
  const activeStreamId = useTelemetryStore((s) => s.activeStreamId);
  const packetRateHz = useTelemetryStore((s) => s.packetRateHz);
  const duplicatePackets = useTelemetryStore((s) => s.duplicatePackets);
  const outOfOrderPackets = useTelemetryStore((s) => s.outOfOrderPackets);
  const sequenceGaps = useTelemetryStore((s) => s.sequenceGaps);
  const sequenceResets = useTelemetryStore((s) => s.sequenceResets);
  const streamSwitches = useTelemetryStore((s) => s.streamSwitches);

  const result = evaluateV1PlusHealthCheck({
    deviceRegistry,
    linkRegistry,
    gatewayHealth,
    connectionState,
    isTelemetryStale,
    activeStreamId,
    packetRateHz,
    duplicatePackets,
    outOfOrderPackets,
    sequenceGaps,
    sequenceResets,
    streamSwitches,
  });

  return (
    <section className="border border-slate-800 bg-slate-950 p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-cyan-300">
            V1+ Supervisory Health Check
          </h2>
          <p className="text-xs uppercase tracking-widest text-slate-500">
            Topology-aware PASS / WARNING / FAIL validation
          </p>
        </div>

        <div className={`border px-5 py-3 font-mono text-xl font-bold ${resultClass(result.overall)}`}>
          {result.overall}
        </div>
      </div>

      <section className="mb-4 grid grid-cols-4 gap-3">
        <SummaryMetric label="PASS" value={result.summary.pass.toString()} state="PASS" />
        <SummaryMetric label="WARNING" value={result.summary.warning.toString()} state="WARNING" />
        <SummaryMetric label="FAIL" value={result.summary.fail.toString()} state="FAIL" />
        <SummaryMetric label="CRITICAL" value={result.summary.critical.toString()} state={result.summary.critical > 0 ? "FAIL" : "PASS"} />
      </section>

      <div className="grid gap-4">
        {categories.map((category) => {
          const rules = sortRules(
            result.rules.filter((rule) => rule.category === category)
          );

          if (rules.length === 0) return null;

          return (
            <section key={category} className="border border-slate-800 bg-slate-900/50 p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-widest text-cyan-200">
                  {category}
                </h3>
                <div className="font-mono text-xs text-slate-500">
                  {rules.length} rules
                </div>
              </div>

              <div className="grid gap-2">
                {rules.map((rule) => (
                  <RuleRow key={rule.rule_id} rule={rule} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function RuleRow({ rule }: { rule: HealthCheckRule }) {
  return (
    <div className="grid grid-cols-1 gap-2 border border-slate-800 bg-slate-950 p-3 text-xs xl:grid-cols-[110px_110px_260px_1fr_260px] xl:items-center">
      <div className={`font-mono font-bold ${resultTextClass(rule.result)}`}>
        {rule.result}
      </div>
      <div className={`font-mono font-bold ${severityTextClass(rule.severity ?? "INFO")}`}>
        {rule.severity ?? "INFO"}
      </div>
      <div className="font-semibold text-cyan-100">{rule.label}</div>
      <div className="text-slate-400">{rule.details}</div>
      <div className="font-mono text-slate-500">
        {formatEvidence(rule)}
      </div>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: string;
}) {
  return (
    <div className={`border p-3 ${summaryClass(state)}`}>
      <div className="text-xs uppercase tracking-widest opacity-80">{label}</div>
      <div className="font-mono text-lg font-bold">{value}</div>
    </div>
  );
}

function sortRules(rules: HealthCheckRule[]) {
  const order = {
    FAIL: 0,
    WARNING: 1,
    PASS: 2,
  };

  return [...rules].sort((a, b) => order[a.result] - order[b.result]);
}

function formatEvidence(rule: HealthCheckRule) {
  if (!rule.evidence) return "evidence=-";

  const value =
    rule.evidence.value === null || rule.evidence.value === undefined
      ? "-"
      : rule.evidence.value.toString();
  const timestamp = rule.evidence.timestamp_utc
    ? ` @ ${rule.evidence.timestamp_utc}`
    : "";

  return `${rule.evidence.source}: ${value}${timestamp}`;
}

function resultClass(result: string) {
  if (result === "PASS") return "border-emerald-500 text-emerald-300";
  if (result === "WARNING") return "border-amber-500 text-amber-300";
  return "border-red-500 text-red-300";
}

function resultTextClass(result: string) {
  if (result === "PASS") return "text-emerald-300";
  if (result === "WARNING") return "text-amber-300";
  return "text-red-300";
}

function severityTextClass(severity: string) {
  if (severity === "CRITICAL" || severity === "ERROR") return "text-red-300";
  if (severity === "WARNING") return "text-amber-300";
  return "text-slate-400";
}

function summaryClass(state: string) {
  if (state === "PASS") return "border-emerald-500 bg-emerald-950/20 text-emerald-300";
  if (state === "WARNING") return "border-amber-500 bg-amber-950/20 text-amber-300";
  return "border-red-500 bg-red-950/20 text-red-300";
}
