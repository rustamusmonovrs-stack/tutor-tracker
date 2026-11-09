import type { Standing } from "./scoring";

/**
 * Presentation helpers for the Reyting page. They only group and order rows that buildStandings already ranked
 * (competition ranking: ties share a rank, the next rank skips: 1, 2, 2, 4). No score or rank is computed here.
 */

export interface PodiumTier {
  /** The real rank (1-3). Tied students share one tier. */
  rank: number;
  coins: number;
  members: Standing[];
}

/**
 * Everyone with a real rank 1-3 and at least one coin, grouped by rank. With ties there may be fewer than three
 * tiers (1, 2, 2 -> ranks 1 and 2; 1, 1, 1 -> rank 1 only): nobody is moved to an empty place to fill the podium.
 */
export function podiumTiers(standings: Standing[]): PodiumTier[] {
  const tiers: PodiumTier[] = [];
  for (const s of standings) {
    if (s.coins <= 0 || s.rank > 3) continue;
    const tier = tiers.find((t) => t.rank === s.rank);
    if (tier) tier.members.push(s);
    else tiers.push({ rank: s.rank, coins: s.coins, members: [s] });
  }
  return tiers.sort((a, b) => a.rank - b.rank);
}

/**
 * Visual order of the podium cards: with three tiers the best one sits in the middle (2 · 1 · 3). With one or two
 * tiers they are shown in rank order. The rank written on each card never changes.
 */
export function podiumOrder(tiers: PodiumTier[]): PodiumTier[] {
  return tiers.length === 3 ? [tiers[1], tiers[0], tiers[2]] : tiers;
}

/** Large tied groups do not fit the three-column podium: they are shown as full-width tiers instead. */
export const PODIUM_MAX_PER_CARD = 4;

export const MEDAL: Record<number, "gold" | "silver" | "bronze"> = { 1: "gold", 2: "silver", 3: "bronze" };

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
