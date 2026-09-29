export type Page =
  | "overview"
  | "topology"
  | "chips"
  | "power"
  | "rtc"
  | "logs"
  | "registry"
  | "health"
  | "report";

export type NavigationItem = {
  id: Page;
  label: string;
};

export const navigationItems: readonly NavigationItem[] = [
  { id: "overview", label: "Overview" },
  { id: "topology", label: "System Topology" },
  { id: "chips", label: "Hardware" },
  { id: "power", label: "Power" },
  { id: "rtc", label: "Time & Clock" },
  { id: "logs", label: "Event Log" },
  { id: "registry", label: "Devices" },
  { id: "health", label: "System Health" },
  { id: "report", label: "Reports" },
];

export const pageTitles: Record<Page, string> = Object.fromEntries(
  navigationItems.map((item) => [item.id, item.label])
) as Record<Page, string>;
