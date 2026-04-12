export interface RestaurantConfig {
  id: string;
  slug: string;
  dbName: string;
  name: string;
  shortName: string;
  features: {
    zones: boolean;
    comments: boolean;
    itemCrud: boolean;
    translate: boolean;
    discord: boolean;
    calendar: boolean;
  };
  theme: {
    primary: string;
    colorScheme: "green" | "teal";
    pinBg: string;
    gradient: { from: string; to: string };
  };
  zoneNames?: Record<number, string>;
  zoneOrder?: number[];
  pinCode: string;
  unlockCode: string;
  email: string;
  emailSecret: string;
  emailSubjectPrefix: string;
  systemName: string;
}

/**
 * Secrets are read from environment variables so they are never committed
 * to source control. Fallback values are provided only for local dev.
 * In production, all VAL_* and MAILLANE_* vars must be explicitly set.
 */
function requireEnv(key: string, devFallback: string): string {
  const value = process.env[key];
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      console.error(`[Config] FATAL: environment variable ${key} is not set`);
      process.exit(1);
    }
    console.warn(`[Config] WARNING: ${key} not set — using dev fallback`);
    return devFallback;
  }
  return value;
}

export const RESTAURANTS: Record<string, RestaurantConfig> = {
  val: {
    id: "val",
    slug: "suguval",
    dbName: "mybeez_val",
    name: "Valentine",
    shortName: "V",
    features: {
      zones: true,
      comments: true,
      itemCrud: true,
      translate: true,
      discord: true,
      calendar: true,
    },
    theme: {
      primary: "amber",
      colorScheme: "green",
      pinBg: "from-amber-500 to-orange-600",
      gradient: { from: "from-amber-500/10", to: "to-orange-500/10" },
    },
    zoneNames: {
      1: "CUISINE",
      2: "SUSHI BAR",
      3: "RÉSERVE SÈCHE",
      4: "HYGIÈNE & CONSOMMABLES",
      5: "BOISSONS",
      6: "LIVRAISON & EMBALLAGES",
    },
    zoneOrder: [1, 2, 3, 4, 5, 6],
    pinCode: requireEnv("VAL_PIN_CODE", "2792"),
    unlockCode: requireEnv("VAL_UNLOCK_CODE", "102040"),
    email: "sugu.gestion@gmail.com",
    emailSecret: requireEnv("VAL_EMAIL_SECRET", "suguval-internal-2024"),
    emailSubjectPrefix: "[SUGUVAL]",
    systemName: "Suguval",
  },
  maillane: {
    id: "maillane",
    slug: "sugumaillane",
    dbName: "mybeez_maillane",
    name: "Maillane",
    shortName: "M",
    features: {
      zones: false,
      comments: false,
      itemCrud: false,
      translate: false,
      discord: false,
      calendar: false,
    },
    theme: {
      primary: "emerald",
      colorScheme: "teal",
      pinBg: "from-emerald-500 to-teal-600",
      gradient: { from: "from-emerald-500/10", to: "to-teal-500/10" },
    },
    pinCode: requireEnv("MAILLANE_PIN_CODE", "2792"),
    unlockCode: requireEnv("MAILLANE_UNLOCK_CODE", "102040"),
    email: "sugu.resto@gmail.com",
    emailSecret: requireEnv("MAILLANE_EMAIL_SECRET", "sugumaillane-internal-2024"),
    emailSubjectPrefix: "[SUGU MAILLANE]",
    systemName: "SUGU Maillane",
  },
};

export function getBySlug(slug: string): RestaurantConfig | undefined {
  return Object.values(RESTAURANTS).find((r) => r.slug === slug);
}

export function getById(id: string): RestaurantConfig | undefined {
  return RESTAURANTS[id];
}

export function getAll(): RestaurantConfig[] {
  return Object.values(RESTAURANTS);
}
