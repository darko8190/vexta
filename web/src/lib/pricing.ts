import type { MarginMode, PricePolicyTier } from "@/lib/types";

/**
 * Turning a purchase price into a selling price, and back.
 *
 * Both conventions are called "la marge" on a job site and they give different numbers from the
 * same percentage, which is why the company says once which one it means:
 *
 * Multiplication — markup on cost: vendant = achat × (1 + marge / 100). 100 $ at 35 % = 135 $.
 * Division — margin on the selling price: vendant = achat ÷ (1 − marge / 100). 100 $ at 35 % =
 * 153,85 $, and the profit really is 35 % of what the client pays.
 *
 * The same arithmetic lives on the API, which is what actually prices a saved line; this copy
 * is what lets the form answer while someone is typing.
 */
export function sellingPriceFrom(
  purchasePrice: number | null | undefined,
  marginPercent: number | null | undefined,
  mode: MarginMode,
): number | null {
  if (purchasePrice == null || Number.isNaN(purchasePrice)) return null;

  const margin = marginPercent ?? 0;

  if (mode === "Division") {
    // A margin of 100 % would mean giving the client the goods and charging infinity for them.
    if (margin >= 100) return null;
    return round(purchasePrice / (1 - margin / 100));
  }

  return round(purchasePrice * (1 + margin / 100));
}

/**
 * The margin a policy charges on one purchase price.
 *
 * The first band the cost falls into wins, read in ascending order of where they start. A cost
 * that falls in none is priced at the policy's own flat margin — which is the whole behaviour of
 * a policy with no bands, so bands change nothing until somebody writes one.
 *
 * A cost that is not yet known gets the flat margin rather than the first band: pricing an
 * unknown cost at the cheap-end percentage would make the smallest number in the table the
 * silent default for every blank line.
 *
 * Null policy means the invoice names none, and the caller falls back to the product's own
 * margin — which is why this returns null rather than zero.
 */
export function policyMarginFor(
  policy: { marginPercent: number; tiers: PricePolicyTier[] } | null | undefined,
  purchasePrice: number | null | undefined,
): number | null {
  if (!policy) return null;
  if (purchasePrice == null || Number.isNaN(purchasePrice)) return policy.marginPercent;

  const match = [...policy.tiers]
    .sort((a, b) => a.fromAmount - b.fromAmount)
    .find((tier) => purchasePrice >= tier.fromAmount && (tier.toAmount == null || purchasePrice <= tier.toAmount));

  return match ? match.marginPercent : policy.marginPercent;
}

/** The margin a pair of prices implies, so typing a selling price updates the field beside it. */
export function marginPercentFrom(
  purchasePrice: number | null | undefined,
  sellingPrice: number | null | undefined,
  mode: MarginMode,
): number | null {
  if (purchasePrice == null || sellingPrice == null) return null;
  if (purchasePrice <= 0 || sellingPrice <= 0) return null;

  if (mode === "Division") {
    return round(((sellingPrice - purchasePrice) / sellingPrice) * 100, 3);
  }

  return round(((sellingPrice - purchasePrice) / purchasePrice) * 100, 3);
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
