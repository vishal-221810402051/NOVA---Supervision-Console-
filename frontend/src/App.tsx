import { useTelemetrySocket } from "./hooks/useTelemetrySocket";
import { useTelemetryStore } from "./store/telemetryStore";
import { SystemOverview } from "./components/SystemOverview";
import { ChipStatus } from "./components/ChipStatus";
import { PowerHealth } from "./components/PowerHealth";
import { EngineeringLogs } from "./components/EngineeringLogs";

export default function App() {
  useTelemetrySocket();

  const connected = useTelemetryStore((s) => s.connected);
  const lastPacketAt = useTelemetryStore((s) => s.lastPacketAt);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-black px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-widest text-cyan-300">
              NOVA SC
            </h1>
            <p className="text-xs uppercase tracking-widest text-slate-500">
              Supervision Console / Phase 2
            </p>
          </div>

          <div className="text-right font-mono text-xs">
            <div className={connected ? "text-emerald-300" : "text-red-300"}>
              WS: {connected ? "CONNECTED" : "OFFLINE"}
            </div>
            <div className="text-slate-500">LAST: {lastPacketAt ?? "NO PACKET"}</div>
          </div>
        </div>
      </header>

      <main className="grid gap-4 p-6">
        <SystemOverview />
        <ChipStatus />
        <PowerHealth />
        <EngineeringLogs />
      </main>
    </div>
  );
}
