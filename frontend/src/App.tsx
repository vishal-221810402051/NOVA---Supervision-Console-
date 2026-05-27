import { useState } from "react";
import { useTelemetrySocket } from "./hooks/useTelemetrySocket";
import { useTelemetryStore } from "./store/telemetryStore";
import { SystemOverview } from "./components/SystemOverview";
import { ChipStatus } from "./components/ChipStatus";
import { PowerHealth } from "./components/PowerHealth";
import { EngineeringLogs } from "./components/EngineeringLogs";
import { Sidebar } from "./components/Sidebar";
import { TelemetryStats } from "./components/TelemetryStats";
import { DeviceRegistryPanel } from "./components/DeviceRegistryPanel";
import { GlobalStatusBar } from "./components/GlobalStatusBar";
import { HealthCheckPanel } from "./components/HealthCheckPanel";

type Page = "overview" | "chips" | "power" | "logs" | "registry" | "health";

export default function App() {
  useTelemetrySocket();

  const [activePage, setActivePage] = useState<Page>("overview");
  const connectionState = useTelemetryStore((s) => s.connectionState);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar activePage={activePage} setActivePage={setActivePage} />

      <div className="flex flex-1 flex-col">
        <header className="border-b border-slate-800 bg-black px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-widest text-cyan-300">
                NOVA SC / PHASE 3
              </h1>
              <p className="text-xs uppercase tracking-widest text-slate-500">
                Telemetry Architecture Hardening
              </p>
            </div>

            <div className="text-right font-mono text-xs">
              <div
                className={
                  connectionState === "CONNECTED"
                    ? "text-emerald-300"
                    : connectionState === "RECONNECTING"
                      ? "text-amber-300"
                      : "text-red-300"
                }
              >
                WS: {connectionState}
              </div>
            </div>
          </div>
        </header>

        <main className="grid gap-4 p-6">
          <GlobalStatusBar />
          <TelemetryStats />

          {activePage === "overview" && <SystemOverview />}
          {activePage === "chips" && <ChipStatus />}
          {activePage === "power" && <PowerHealth />}
          {activePage === "logs" && <EngineeringLogs />}
          {activePage === "registry" && <DeviceRegistryPanel />}
          {activePage === "health" && <HealthCheckPanel />}
        </main>
      </div>
    </div>
  );
}
