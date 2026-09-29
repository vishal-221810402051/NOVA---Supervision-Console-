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
import { ReportExportPanel } from "./components/ReportExportPanel";
import { TopologyView } from "./components/TopologyView";
import { RtcStatus } from "./components/RtcStatus";
import { PageHeader } from "./components/ui/PageHeader";
import { StatusChip, type StatusTone } from "./components/ui/StatusChip";
import { pageTitles, type Page } from "./presentation/navigation";

export default function App() {
  useTelemetrySocket();

  const [activePage, setActivePage] = useState<Page>("overview");
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const connectionState = useTelemetryStore((s) => s.connectionState);
  const connectionPresentation = presentConnectionState(connectionState);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        mobileOpen={mobileNavigationOpen}
        onCloseMobile={() => setMobileNavigationOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          title={pageTitles[activePage]}
          onOpenNavigation={() => setMobileNavigationOpen(true)}
          navigationOpen={mobileNavigationOpen}
          status={
            <StatusChip tone={connectionPresentation.tone}>
              {connectionPresentation.label}
            </StatusChip>
          }
        />

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-5 lg:px-6 lg:py-6">
          <div className="mx-auto grid w-full max-w-[1800px] min-w-0 gap-4">
            <GlobalStatusBar />
            {activePage === "overview" && <TelemetryStats />}

            {activePage === "overview" && <SystemOverview />}
            {activePage === "topology" && <TopologyView />}
            {activePage === "chips" && <ChipStatus />}
            {activePage === "power" && <PowerHealth />}
            {activePage === "rtc" && <RtcStatus />}
            {activePage === "logs" && <EngineeringLogs />}
            {activePage === "registry" && <DeviceRegistryPanel />}
            {activePage === "health" && <HealthCheckPanel />}
            {activePage === "report" && <ReportExportPanel />}
          </div>
        </main>
      </div>
    </div>
  );
}

function presentConnectionState(state: string): {
  label: string;
  tone: StatusTone;
} {
  if (state === "CONNECTED") return { label: "Connected", tone: "healthy" };
  if (state === "RECONNECTING") {
    return { label: "Reconnecting", tone: "attention" };
  }
  if (state === "OFFLINE") return { label: "Offline", tone: "fault" };
  return { label: state, tone: "neutral" };
}
