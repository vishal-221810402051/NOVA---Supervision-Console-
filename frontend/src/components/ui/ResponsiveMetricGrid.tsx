import type { ReactNode } from "react";

type ResponsiveMetricGridProps = {
  children: ReactNode;
  className?: string;
};

export function ResponsiveMetricGrid({
  children,
  className = "",
}: ResponsiveMetricGridProps) {
  return (
    <div
      className={`grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${className}`}
    >
      {children}
    </div>
  );
}
