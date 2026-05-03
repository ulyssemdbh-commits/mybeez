import { Construction } from "lucide-react";

interface Props {
  label: string;
  description?: string;
}

/**
 * Placeholder rendered for management sections whose UI hasn't been
 * implemented yet. Replaced incrementally by real section components
 * in PRs #2-#8.
 */
export function SectionPlaceholder({ label, description }: Props) {
  return (
    <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-12 text-center space-y-3">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
        <Construction className="w-6 h-6" />
      </div>
      <h2 className="text-lg font-semibold">{label}</h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        {description ?? "Cette section est en cours de développement et sera disponible prochainement."}
      </p>
    </div>
  );
}
