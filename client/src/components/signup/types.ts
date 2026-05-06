/**
 * Shared types for the signup wizard.
 *
 * `ApiTemplate` mirrors the shape returned by `GET /api/templates` after
 * the catalog enrichment (PR-A). The picker reads ALL the new fields:
 * icon, tagline, idealFor, coverGradient, featuresHighlight, notIncluded.
 */

export interface ApiTemplate {
  id: number;
  parentId: number | null;
  slug: string;
  name: string;
  description: string | null;
  modules: string[];
  defaultCategories: Record<string, unknown>;
  vocabulary: Record<string, string>;
  taxRules: Record<string, number>;
  icon: string | null;
  tagline: string | null;
  idealFor: string | null;
  coverGradient: string | null;
  featuresHighlight: string[];
  notIncluded: string[];
  isActive: boolean;
  sortOrder: number;
  children?: ApiTemplate[];
}

export interface SignupAccountForm {
  email: string;
  password: string;
  fullName: string;
  tenantName: string;
  tenantSlug: string;
}

export type WizardStep = 1 | 2 | 3;

export interface WizardSelection {
  vertical: ApiTemplate | null;
  template: ApiTemplate | null;
}
