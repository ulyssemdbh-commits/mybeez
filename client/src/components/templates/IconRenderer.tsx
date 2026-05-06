/**
 * IconRenderer — résout un nom Lucide string en composant React.
 *
 * Whitelist explicite : tree-shakable, sûr (le compilateur sait quels
 * icônes embarquer dans le bundle). Si un nouveau template est ajouté
 * en seed avec une icône absente d'ici, l'icône `Briefcase` est rendue
 * en fallback et un warning console signale l'oubli.
 *
 * Garder cette liste en sync avec `server/seed/templates.ts`.
 */

import {
  Activity,
  BookOpen,
  Briefcase,
  Camera,
  Car,
  ChefHat,
  Coffee,
  Croissant,
  Dumbbell,
  Flower,
  Heart,
  HeartPulse,
  Home,
  Lamp,
  Pizza,
  Scissors,
  ShoppingBag,
  Shirt,
  Smile,
  Soup,
  Sparkles,
  Store,
  Truck,
  UtensilsCrossed,
  Wine,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Whitelist exposée pour les tests : permet de vérifier que toute icône
 * référencée par `SEED_TEMPLATES` est bien embarquée. Ne pas importer
 * en runtime applicatif — utiliser `IconRenderer` à la place.
 */
export const ICON_WHITELIST: Record<string, LucideIcon> = {
  Activity,
  BookOpen,
  Briefcase,
  Camera,
  Car,
  ChefHat,
  Coffee,
  Croissant,
  Dumbbell,
  Flower,
  Heart,
  HeartPulse,
  Home,
  Lamp,
  Pizza,
  Scissors,
  ShoppingBag,
  Shirt,
  Smile,
  Soup,
  Sparkles,
  Store,
  Truck,
  UtensilsCrossed,
  Wine,
  Wrench,
};

interface Props {
  name: string | null;
  className?: string;
  fallback?: LucideIcon;
}

export function IconRenderer({ name, className, fallback = Briefcase }: Props) {
  const Icon = (name && ICON_WHITELIST[name]) || fallback;
  if (name && !ICON_WHITELIST[name] && typeof window !== "undefined") {
    console.warn(`[IconRenderer] Lucide icon "${name}" not whitelisted, falling back.`);
  }
  return <Icon className={className} aria-hidden="true" />;
}
