type Page = "overview" | "chips" | "power" | "logs";

type Props = {
  activePage: Page;
  setActivePage: (page: Page) => void;
};

const items: { id: Page; label: string }[] = [
  { id: "overview", label: "System Overview" },
  { id: "chips", label: "Chip Status" },
  { id: "power", label: "Power Health" },
  { id: "logs", label: "Engineering Logs" },
];

export function Sidebar({ activePage, setActivePage }: Props) {
  return (
    <aside className="min-h-screen w-64 border-r border-slate-800 bg-black p-4">
      <div className="mb-8">
        <div className="text-lg font-bold tracking-widest text-cyan-300">
          NOVA SC
        </div>
        <div className="text-[10px] uppercase tracking-widest text-slate-500">
          Supervision Console
        </div>
      </div>

      <nav className="grid gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => setActivePage(item.id)}
            className={`border px-3 py-3 text-left text-xs uppercase tracking-widest ${
              activePage === item.id
                ? "border-cyan-400 bg-cyan-950/30 text-cyan-200"
                : "border-slate-800 bg-slate-950 text-slate-500 hover:border-slate-600 hover:text-slate-300"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
