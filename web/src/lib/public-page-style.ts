import type { PublicPageStyle } from "@/lib/types";

/**
 * The class names each arrangement of the public page uses.
 *
 * One table rather than four copies of the page. The four looks differ in about eight
 * decisions -- how wide the measure is, whether there are frames, how loud the headings are --
 * and four full layouts would mean a change to the products section had to be made four times,
 * which is how three of them quietly fall behind.
 *
 * Nothing here sets a colour. Every style paints from the company's own brand colour through
 * `--primary`, and the text keeps the foreground it inherits, so no choice a company makes here
 * can produce a page that cannot be read.
 */
export type PublicPageStyleTokens = {
  /** The band of company colour across the very top. */
  accentBar: string;
  header: string;
  headerInner: string;
  headerText: string;
  container: string;
  title: string;
  headline: string;
  sectionTitle: string;
  /** Product and posting cards. */
  card: string;
  /** How many products sit side by side. */
  productGrid: string;
  logoFrame: string;
  sectionGap: string;
};

const classique: PublicPageStyleTokens = {
  accentBar: "h-1.5 w-full bg-primary",
  header: "border-b border-border",
  headerInner: "flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6",
  headerText: "min-w-0",
  container: "mx-auto w-full max-w-4xl px-4 sm:px-6",
  title: "text-2xl font-semibold tracking-tight text-foreground sm:text-3xl",
  headline: "mt-2 text-base text-muted-foreground sm:text-lg",
  sectionTitle: "text-lg font-semibold text-foreground",
  card: "rounded-xl border border-border bg-card",
  productGrid: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
  logoFrame: "flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-card",
  sectionGap: "space-y-12 sm:space-y-16",
};

/**
 * A dark masthead and uppercase headings. Reads as a contractor's sign rather than a brochure,
 * which is what most of these companies actually are.
 */
const chantier: PublicPageStyleTokens = {
  accentBar: "h-2.5 w-full bg-primary",
  header: "bg-foreground text-background",
  headerInner: "flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6",
  headerText: "min-w-0",
  container: "mx-auto w-full max-w-5xl px-4 sm:px-6",
  title: "text-3xl font-bold tracking-tight uppercase sm:text-4xl",
  headline: "mt-2 text-base opacity-80 sm:text-lg",
  sectionTitle: "text-sm font-bold uppercase tracking-widest text-foreground",
  card: "rounded-none border-l-4 border-primary border-y border-r border-border bg-card",
  productGrid: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
  logoFrame: "flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-none border-2 border-background/30 bg-background",
  sectionGap: "space-y-12 sm:space-y-16",
};

/** Narrow and quiet, no frames at all. For a page that is mostly words. */
const epure: PublicPageStyleTokens = {
  accentBar: "h-px w-full bg-border",
  header: "",
  headerInner: "flex flex-col items-center gap-4 text-center",
  headerText: "min-w-0 text-center",
  container: "mx-auto w-full max-w-2xl px-4 sm:px-6",
  title: "text-2xl font-normal tracking-tight text-foreground sm:text-3xl",
  headline: "mt-3 text-base text-muted-foreground sm:text-lg",
  sectionTitle: "text-xs font-medium uppercase tracking-widest text-muted-foreground",
  card: "rounded-none border-0 border-t border-border bg-transparent",
  productGrid: "grid gap-8 sm:grid-cols-2",
  logoFrame: "flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-card",
  sectionGap: "space-y-16 sm:space-y-20",
};

/** Products first and larger. For a page whose job is to be a catalogue. */
const vitrine: PublicPageStyleTokens = {
  accentBar: "h-1 w-full bg-primary",
  header: "border-b border-border",
  headerInner: "flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6",
  headerText: "min-w-0",
  container: "mx-auto w-full max-w-6xl px-4 sm:px-6",
  title: "text-2xl font-semibold tracking-tight text-foreground sm:text-3xl",
  headline: "mt-2 text-base text-muted-foreground sm:text-lg",
  sectionTitle: "text-xl font-semibold text-foreground",
  card: "rounded-2xl border border-border bg-card shadow-sm",
  productGrid: "grid gap-6 sm:grid-cols-2 lg:grid-cols-4",
  logoFrame: "flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card",
  sectionGap: "space-y-10 sm:space-y-14",
};

/**
 * Editorial. A wide measure and generous leading, with headings reduced to labels so the text
 * is the loudest thing on the page -- which is the point for a company whose page is an
 * argument rather than a list.
 */
const journal: PublicPageStyleTokens = {
  accentBar: "h-px w-full bg-foreground/20",
  header: "border-b-2 border-foreground",
  headerInner: "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
  headerText: "min-w-0",
  container: "mx-auto w-full max-w-3xl px-4 sm:px-6",
  title: "text-3xl font-semibold tracking-tight text-foreground sm:text-4xl",
  headline: "mt-2 text-lg leading-relaxed text-muted-foreground",
  sectionTitle: "border-b border-border pb-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground",
  card: "rounded-none border-0 border-b border-border bg-transparent",
  productGrid: "grid gap-6 sm:grid-cols-2",
  logoFrame: "flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-card",
  sectionGap: "space-y-14 sm:space-y-20",
};

/** Framed panels with a little lift. Reads as a product sheet. */
const panneau: PublicPageStyleTokens = {
  accentBar: "h-2 w-full bg-primary",
  header: "border-b border-border bg-card",
  headerInner: "flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6",
  headerText: "min-w-0",
  container: "mx-auto w-full max-w-5xl px-4 sm:px-6",
  title: "text-2xl font-semibold tracking-tight text-foreground sm:text-3xl",
  headline: "mt-2 text-base text-muted-foreground sm:text-lg",
  sectionTitle: "text-lg font-semibold text-foreground",
  card: "rounded-xl border border-border bg-card shadow-sm ring-1 ring-foreground/5",
  productGrid: "grid gap-5 sm:grid-cols-2 lg:grid-cols-3",
  logoFrame: "flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background shadow-sm",
  sectionGap: "space-y-8 sm:space-y-12",
};

/**
 * A poster: one column, the name very large and centred, nothing competing with it. For a trade
 * whose page exists to be the name and a telephone number.
 */
const affiche: PublicPageStyleTokens = {
  accentBar: "h-3 w-full bg-primary",
  header: "border-b border-border",
  headerInner: "flex flex-col items-center gap-5 text-center",
  headerText: "min-w-0 text-center",
  container: "mx-auto w-full max-w-2xl px-4 sm:px-6",
  title: "text-4xl font-bold tracking-tight text-foreground sm:text-5xl",
  headline: "mt-3 text-lg text-muted-foreground sm:text-xl",
  sectionTitle: "text-center text-xl font-semibold text-foreground",
  card: "rounded-xl border border-border bg-card",
  productGrid: "grid gap-4 sm:grid-cols-2",
  logoFrame: "flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card",
  sectionGap: "space-y-12 sm:space-y-16",
};

const tokens: Record<PublicPageStyle, PublicPageStyleTokens> = {
  Classique: classique,
  Chantier: chantier,
  Epure: epure,
  Vitrine: vitrine,
  Journal: journal,
  Panneau: panneau,
  Affiche: affiche,
};

/** Falls back to Classique for a value this build does not know -- a page always draws. */
export function styleTokensFor(style: PublicPageStyle | null | undefined): PublicPageStyleTokens {
  return (style && tokens[style]) || classique;
}

/** What the picker offers, with the one line that says who each is for. */
export const publicPageStyleOptions: { value: PublicPageStyle; label: string; hint: string }[] = [
  { value: "Classique", label: "Classique", hint: "Sobre et encadré. Le choix par défaut." },
  { value: "Chantier", label: "Chantier", hint: "Bandeau foncé, titres en majuscules. Se lit comme une enseigne." },
  { value: "Epure", label: "Épuré", hint: "Étroit et calme, sans cadres. Pour une page de texte." },
  { value: "Vitrine", label: "Vitrine", hint: "Produits en premier et plus grands. Pour un catalogue." },
  { value: "Journal", label: "Journal", hint: "Mesure large, texte aéré, titres discrets. Pour une page qui argumente." },
  { value: "Panneau", label: "Panneau", hint: "Tout en panneaux encadrés. Se lit comme une fiche produit." },
  { value: "Affiche", label: "Affiche", hint: "Une colonne, le nom très grand et centré. Pour un métier." },
];
