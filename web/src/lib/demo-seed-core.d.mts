// Types for the framework-agnostic demo-seed gate (see demo-seed-core.mjs).
export const DEMO_SEED_SKIP_EXIT: 0;
export const DEMO_SEED_REFUSE_EXIT: 2;

export type DemoSeedAction = "seed" | "skip" | "refuse";

export interface DemoSeedDecision {
  action: DemoSeedAction;
  reason: string;
  warning: string | null;
  exitCode: 0 | 2;
}

/** "0"/"1" (exactly, trimmed); "invalid" when present, non-empty, and not 0/1; null when unset (absent or empty). */
export function normalizeSeedFlag(raw: string | undefined): "0" | "1" | "invalid" | null;
export function resolveDemoSeedAction(env: Record<string, string | undefined>): DemoSeedDecision;
