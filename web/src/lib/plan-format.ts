import type { PublicModule, PublicPlan } from "@/lib/types";

/** "1 utilisateur", "Jusqu'à 5 utilisateurs", "De 3 à 10 utilisateurs". */
export function planSeats(min: number, max: number): string {
  if (min === max) return max === 1 ? "1 utilisateur" : `${max} utilisateurs`;
  if (min <= 1) return `Jusqu'à ${max} utilisateurs`;
  return `De ${min} à ${max} utilisateurs`;
}

export function formatPlanPrice(amountCents: number, currency: string) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100);
}

/** What one seat costs once the plan is full: the number that makes a bigger tier worth it. */
export function pricePerSeat(plan: PublicPlan) {
  return formatPlanPrice(Math.round(plan.amountCents / Math.max(plan.maxUsers, 1)), plan.currency);
}

/** "Les 16 modules inclus", or "1 module inclus". */
export function modulesIncluded(count: number) {
  return count === 1 ? "1 module inclus" : `Les ${count} modules inclus`;
}

export function trialLabel(days: number) {
  return days === 1 ? "1 jour d'essai gratuit" : `${days} jours d'essai gratuit`;
}

export function discountLabel(plan: PublicPlan) {
  if (plan.discountPercent <= 0 || plan.discountMonths <= 0) return null;
  return plan.discountMonths === 1
    ? `${plan.discountPercent} % de rabais le premier mois`
    : `${plan.discountPercent} % de rabais les ${plan.discountMonths} premiers mois`;
}

/** What the first months cost once the discount is off, or null when the plan has none. */
export function discountedPrice(plan: PublicPlan) {
  if (plan.discountPercent <= 0 || plan.discountMonths <= 0) return null;
  return formatPlanPrice(Math.round((plan.amountCents * (100 - plan.discountPercent)) / 100), plan.currency);
}

/** "les 3 premiers mois" / "le premier mois". */
export function discountPeriod(months: number) {
  return months === 1 ? "le premier mois" : `les ${months} premiers mois`;
}

/**
 * The offers worth a line above the plans: the longest trial and the biggest discount on offer,
 * so a visitor learns about them before comparing prices. Null when no plan has either.
 */
export function bestOffers(plans: PublicPlan[]) {
  const trial = Math.max(0, ...plans.map((plan) => plan.trialDays));
  const discounted = plans.filter((plan) => plan.discountPercent > 0 && plan.discountMonths > 0);
  const percent = Math.max(0, ...discounted.map((plan) => plan.discountPercent));
  if (trial === 0 && percent === 0) return null;
  return { trial, percent };
}

/**
 * The plan the eye should land on: the middle one of an odd row of three or more, the way a
 * pricing table is usually read. None for one or two plans, where there is no middle.
 */
export function highlightedPlanId(plans: PublicPlan[]) {
  return plans.length >= 3 && plans.length % 2 === 1 ? plans[(plans.length - 1) / 2].id : null;
}

/**
 * Every module offered by at least one plan, in the catalogue's own order. The comparison is
 * built from this, so a module added to a plan shows up in the table without anyone editing it.
 */
export function comparedModules(plans: PublicPlan[], catalogue: PublicModule[]) {
  const offered = new Map<string, PublicModule>();
  for (const plan of plans) for (const item of plan.modules) offered.set(item.id, item);

  const ordered = catalogue.filter((item) => offered.has(item.id));
  // A module a plan carries but the public list does not (unpublished since) still compares.
  const rest = [...offered.values()].filter((item) => !ordered.some((m) => m.id === item.id));
  return [...ordered, ...rest];
}

/** The same for features, in the order the plans list them. */
export function comparedFeatures(plans: PublicPlan[]) {
  const offered = new Map<string, PublicPlan["features"][number]>();
  for (const plan of plans) for (const feature of plan.features) offered.set(feature.key, feature);
  return [...offered.values()];
}
