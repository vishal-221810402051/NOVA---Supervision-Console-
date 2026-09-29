import { useTelemetryStore } from "../store/telemetryStore";
import { evaluateV1PlusHealthCheck } from "../state/healthCheckEngine";
import type { HealthCheckCategory, HealthCheckRule } from "../types/telemetry";
import { MetricCard } from "./ui/MetricCard";
import { SectionCard } from "./ui/SectionCard";
import { StatusChip, type StatusTone } from "./ui/StatusChip";

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

const categoryLabels: Partial<Record<HealthCheckCategory, string>> = {
  TOPOLOGY: "System Topology",
  GATEWAY: "Gateway",
  LINK: "Connections",
  STREAM: "Data Stream",
  INTEGRITY: "Data Integrity",
  NODE: "Controllers",
  CHIP: "Hardware",
  POWER: "Power",
  EXPECTED_WARNING: "Known Limitations",
  LEGACY: "Legacy Checks",
};

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
  const activeTelemetrySource = useTelemetryStore((s) => s.activeTelemetrySource);

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
    hardwareBringupMode: !activeTelemetrySource.is_simulated,
  });

  return (
    <SectionCard
      title="System Health"
      description="Supervisory checks for system status, connectivity, and telemetry quality"
      action={<StatusChip tone={resultTone(result.overall)}>{humanizeResult(result.overall)}</StatusChip>}
    >
      <section className="mb-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label="System health summary">
        <MetricCard label="Overall Status" value={humanizeResult(result.overall)} />
        <MetricCard label="Passed Checks" value={result.summary.pass.toString()} />
        <MetricCard label="Warnings" value={result.summary.warning.toString()} />
        <MetricCard label="Failed Checks" value={result.summary.fail.toString()} />
        <MetricCard label="Critical Issues" value={result.summary.critical.toString()} />
      </section>

      <div className="grid min-w-0 gap-4">
        {categories.map((category) => {
          const rules = sortRules(result.rules.filter((rule) => rule.category === category));

          if (rules.length === 0) return null;

          return (
            <section key={category} className="min-w-0 rounded-md border border-slate-800 bg-slate-900/50 p-4">
              <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
                <h3 className="min-w-0 break-words text-sm font-semibold text-slate-100">
                  {categoryLabels[category] ?? "Other Checks"}
                </h3>
                <span className="shrink-0 text-xs text-slate-500">
                  {rules.length} {rules.length === 1 ? "check" : "checks"}
                </span>
              </div>

              <div className="grid min-w-0 gap-3">
                {rules.map((rule) => (
                  <RuleRow key={rule.rule_id} rule={rule} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </SectionCard>
  );
}

function RuleRow({ rule }: { rule: HealthCheckRule }) {
  const severity = rule.severity ?? "INFO";

  return (
    <article className="min-w-0 rounded-md border border-slate-800 bg-slate-950/80 p-4">
      <div className="grid min-w-0 gap-3 [min-width:1366px]:grid-cols-[auto_auto_minmax(12rem,0.8fr)_minmax(16rem,1.5fr)] [min-width:1366px]:items-start">
        <LabeledStatus label="Result" value={humanizeResult(rule.result)} tone={resultTone(rule.result)} />
        <LabeledStatus label="Severity" value={humanizeSeverity(severity)} tone={severityTone(severity)} />
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-500">Check</div>
          <div className="mt-1 break-words text-sm font-semibold text-slate-100">{rule.label}</div>
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-500">Details</div>
          <div className="mt-1 break-words text-sm text-slate-300">{rule.details}</div>
        </div>
      </div>

      <details className="mt-4 border-t border-slate-800 pt-3 text-xs">
        <summary className="cursor-pointer rounded-sm font-medium text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          Technical evidence
        </summary>
        <dl className="mt-3 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <TechnicalField label="Rule ID" value={rule.rule_id} />
          <TechnicalField label="Raw result" value={rule.result} />
          <TechnicalField label="Raw severity" value={severity} />
          <TechnicalField label="Evidence source" value={rule.evidence?.source ?? "-"} />
          <TechnicalField label="Evidence value" value={formatEvidenceValue(rule)} />
          <TechnicalField label="Evidence timestamp" value={rule.evidence?.timestamp_utc ?? "-"} />
        </dl>
      </details>
    </article>
  );
}

function LabeledStatus({ label, value, tone }: { label: string; value: string; tone: StatusTone }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-medium text-slate-500">{label}</div>
      <StatusChip tone={tone}>{value}</StatusChip>
    </div>
  );
}

function TechnicalField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-mono text-slate-300">{value}</dd>
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

function formatEvidenceValue(rule: HealthCheckRule) {
  const value = rule.evidence?.value;
  return value === null || value === undefined ? "-" : value.toString();
}

function humanizeResult(result: string) {
  if (result === "PASS") return "Passed";
  if (result === "WARNING") return "Needs attention";
  if (result === "FAIL") return "Failed";
  return "Unknown status";
}

function humanizeSeverity(severity: string) {
  if (severity === "INFO") return "Information";
  if (severity === "WARNING") return "Warning";
  if (severity === "ERROR") return "Error";
  if (severity === "CRITICAL") return "Critical";
  return "Unknown status";
}

function resultTone(result: string): StatusTone {
  if (result === "PASS") return "healthy";
  if (result === "WARNING") return "attention";
  if (result === "FAIL") return "fault";
  return "neutral";
}

function severityTone(severity: string): StatusTone {
  if (severity === "CRITICAL" || severity === "ERROR") return "fault";
  if (severity === "WARNING") return "attention";
  return "neutral";
}
