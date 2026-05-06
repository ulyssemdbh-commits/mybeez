/**
 * SignupProgress — barre de progression 3 étapes du wizard.
 *
 * Le clic sur une étape PASSÉE (donc < step actuelle) y revient pour
 * laisser l'utilisateur réviser ses choix. Les étapes futures ne sont
 * pas cliquables tant qu'on n'y est pas arrivé naturellement.
 */

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardStep } from "./types";

interface Props {
  current: WizardStep;
  onJump?: (step: WizardStep) => void;
}

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 1, label: "Activité" },
  { id: 2, label: "Métier" },
  { id: 3, label: "Compte" },
];

export function SignupProgress({ current, onJump }: Props) {
  return (
    <ol className="flex items-center justify-between gap-2 sm:gap-4 max-w-md mx-auto" aria-label="Étapes de création">
      {STEPS.map((s, i) => {
        const done = s.id < current;
        const active = s.id === current;
        const clickable = done && onJump;
        return (
          <li key={s.id} className="flex-1 flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={clickable ? () => onJump(s.id) : undefined}
              disabled={!clickable}
              className={cn(
                "shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all",
                done && "bg-amber-500 border-amber-500 text-white hover:scale-105 cursor-pointer",
                active && "border-amber-500 text-amber-600 dark:text-amber-400",
                !done && !active && "border-zinc-300 dark:border-zinc-700 text-zinc-400 cursor-default",
              )}
              aria-current={active ? "step" : undefined}
              aria-label={done ? `Revenir à l'étape ${s.id} : ${s.label}` : `Étape ${s.id} : ${s.label}`}
            >
              {done ? <Check className="w-4 h-4" /> : s.id}
            </button>
            <span className={cn("text-xs sm:text-sm font-medium truncate", active ? "text-foreground" : "text-muted-foreground")}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <span className={cn("flex-1 h-0.5 rounded-full transition-colors", s.id < current ? "bg-amber-500" : "bg-zinc-200 dark:bg-zinc-800")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
