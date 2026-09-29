import { Menu } from "lucide-react";
import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  onOpenNavigation: () => void;
  navigationOpen: boolean;
  status?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  onOpenNavigation,
  navigationOpen,
  status,
  className = "",
}: PageHeaderProps) {
  return (
    <header className={`border-b border-slate-800/80 bg-slate-950/95 ${className}`}>
      <div className="mx-auto flex min-h-20 w-full max-w-[1800px] min-w-0 items-center gap-3 px-4 py-3 sm:px-5 lg:px-6">
        <button
          type="button"
          onClick={onOpenNavigation}
          aria-label="Open navigation"
          aria-controls="mobile-navigation"
          aria-expanded={navigationOpen}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 lg:hidden"
        >
          <Menu aria-hidden="true" size={20} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <div className="text-lg font-bold tracking-wide text-cyan-300 sm:text-xl">
              NOVA SC
            </div>
            <div className="text-xs font-medium text-slate-500 sm:text-sm">
              Supervision Console
            </div>
          </div>
          <h1 className="mt-1 truncate text-lg font-semibold text-slate-100 sm:text-xl">
            {title}
          </h1>
        </div>

        {status && <div className="shrink-0">{status}</div>}
      </div>
    </header>
  );
}
