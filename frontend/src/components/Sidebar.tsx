import { useEffect } from "react";
import { X } from "lucide-react";
import {
  navigationItems,
  type Page,
} from "../presentation/navigation";

type Props = {
  activePage: Page;
  setActivePage: (page: Page) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

export function Sidebar({
  activePage,
  setActivePage,
  mobileOpen,
  onCloseMobile,
}: Props) {
  useEffect(() => {
    if (!mobileOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseMobile();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen, onCloseMobile]);

  const selectPage = (page: Page) => {
    setActivePage(page);
    onCloseMobile();
  };

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-800/80 bg-black lg:flex">
        <SidebarContent activePage={activePage} selectPage={selectPage} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={onCloseMobile}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <aside
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            className="relative flex h-full w-[min(20rem,88vw)] flex-col border-r border-slate-700 bg-slate-950 shadow-2xl"
          >
            <button
              type="button"
              autoFocus
              onClick={onCloseMobile}
              aria-label="Close navigation"
              className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <X aria-hidden="true" size={20} />
            </button>
            <SidebarContent activePage={activePage} selectPage={selectPage} />
          </aside>
        </div>
      )}
    </>
  );
}

function SidebarContent({
  activePage,
  selectPage,
}: {
  activePage: Page;
  selectPage: (page: Page) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-7 border-b border-slate-800/80 px-2 pb-5 pr-12 lg:pr-2">
        <div className="text-xl font-bold tracking-wide text-cyan-300">NOVA SC</div>
        <div className="mt-1 text-sm font-medium text-slate-500">
          Supervision Console
        </div>
      </div>

      <nav aria-label="Primary navigation" className="grid min-h-0 gap-1 overflow-y-auto">
        {navigationItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => selectPage(item.id)}
            aria-current={activePage === item.id ? "page" : undefined}
            className={`min-h-11 rounded-md border-l-2 px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
              activePage === item.id
                ? "border-cyan-400 bg-cyan-500/10 text-cyan-100"
                : "border-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-100"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
