import type { ElementType, ReactNode } from "react";

type SectionCardProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  as?: ElementType;
  className?: string;
};

export function SectionCard({
  title,
  description,
  action,
  children,
  as: Component = "section",
  className = "",
}: SectionCardProps) {
  return (
    <Component
      className={`min-w-0 rounded-lg border border-slate-800/80 bg-slate-900/55 p-4 sm:p-5 ${className}`}
    >
      {(title || description || action) && (
        <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title && (
              <h2 className="text-base font-semibold text-slate-100 sm:text-lg">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 break-words text-sm text-slate-400">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="min-w-0">{children}</div>
    </Component>
  );
}
