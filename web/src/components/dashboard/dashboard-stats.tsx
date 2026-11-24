"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ClipboardList,
  Clock,
  FileText,
  FolderKanban,
  ListChecks,
  Package,
  Receipt,
  TrendingDown,
  TrendingUp,
  UserSearch,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QuoteStatsCard } from "@/components/dashboard/quote-stats-card";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { useDashboardQuery } from "@/hooks/use-dashboard";
import { formatDateOnly } from "@/lib/dates";
import { invoiceStatusBadgeVariant, invoiceStatusLabels } from "@/lib/labels";
import { formatProjectNumber } from "@/lib/types";
import type { DashboardAttention } from "@/lib/types";
import { cn } from "@/lib/utils";

function money(value: number): string {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

/** The cents matter on a single invoice; on a month's billing they are four characters of noise. */
function exactMoney(value: number): string {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(value);
}

function hours(value: number): string {
  return `${new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 1 }).format(value)} h`;
}

/**
 * One figure, and where to go to act on it.
 *
 * `tone` is only ever used for money that is late. A dashboard whose six tiles are six colours
 * says everything is urgent, which is the same as saying nothing is.
 */
function StatTile({
  href,
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  href: string;
  label: string;
  value: string;
  hint?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "warning";
}) {
  return (
    <Link href={href} className="group">
      <Card className="h-full transition-colors group-hover:border-primary/50">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <Icon
            className={cn("size-4", tone === "warning" ? "text-destructive" : "text-muted-foreground")}
          />
        </CardHeader>
        <CardContent>
          <p
            className={cn(
              "text-2xl font-semibold tabular-nums",
              tone === "warning" && "text-destructive",
            )}
          >
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * How this month compares with the last one.
 *
 * A figure with nothing beside it says only that money came in. Rendered as nothing at all when
 * last month was zero: "+∞ %" is not a comparison, and a company's first month would open on it.
 */
function MonthOverMonth({ now, before }: { now: number; before: number }) {
  if (before <= 0) {
    return before === 0 && now > 0 ? <>Premier mois facturé</> : null;
  }

  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return <>Comme le mois dernier</>;

  const Icon = change > 0 ? TrendingUp : TrendingDown;

  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="size-3" />
      {change > 0 ? "+" : ""}
      {change} % · {money(before)} le mois dernier
    </span>
  );
}

/** A line in "À surveiller": a count, what it is, and where it is dealt with. */
const WATCH_LINES: {
  key: keyof DashboardAttention;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: (count: number) => string;
  urgent?: boolean;
}[] = [
  {
    key: "overdueInvoices",
    href: "/factures",
    icon: Receipt,
    urgent: true,
    label: (count) => (count === 1 ? "1 facture en retard" : `${count} factures en retard`),
  },
  {
    key: "lateTasks",
    href: "/taches-horaire",
    icon: ListChecks,
    urgent: true,
    label: (count) => (count === 1 ? "1 tâche en retard" : `${count} tâches en retard`),
  },
  {
    key: "pendingLeaves",
    href: "/ressources-humaines",
    icon: CalendarClock,
    label: (count) =>
      count === 1 ? "1 demande de congé à décider" : `${count} demandes de congé à décider`,
  },
  {
    key: "expiringCredentials",
    href: "/ressources-humaines",
    icon: ClipboardList,
    label: (count) =>
      count === 1 ? "1 carte échue ou qui expire" : `${count} cartes échues ou qui expirent`,
  },
  {
    key: "lowStockProducts",
    href: "/inventaire",
    icon: Package,
    label: (count) =>
      count === 1 ? "1 produit sous son minimum" : `${count} produits sous leur minimum`,
  },
  {
    key: "newCandidates",
    href: "/ressources-humaines",
    icon: UserSearch,
    label: (count) => (count === 1 ? "1 nouvelle candidature" : `${count} nouvelles candidatures`),
  },
];

/**
 * The company's own screen: what the month has billed, what is owed, and the short list of
 * things somebody has to do something about.
 *
 * Zeros are left out of that list rather than shown as zeros. "0 facture en retard" is a line
 * that has to be read to learn there is nothing to read, and six of them is a panel that trains
 * people to skip the panel.
 */
export function DashboardStats() {
  const { data, isLoading, isError, error, refetch } = useDashboardQuery();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <LoadErrorState
        error={error}
        title="Tableau de bord indisponible"
        fallback="Les chiffres de l'entreprise n'ont pas pu être chargés."
        onRetry={() => refetch()}
      />
    );
  }

  const watch = WATCH_LINES.map((line) => ({ ...line, count: data.attention[line.key] })).filter(
    (line) => line.count > 0,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          href="/factures"
          label="Facturé ce mois-ci"
          value={money(data.billedThisMonth)}
          hint={<MonthOverMonth now={data.billedThisMonth} before={data.billedLastMonth} />}
          icon={FileText}
        />
        <StatTile
          href="/factures"
          label="À recevoir"
          value={money(data.outstanding)}
          hint="Facturé et pas encore encaissé"
          icon={Wallet}
        />
        {/* Only when there is something late. A tile reading 0 $ in red every day of a
            well-run month is a warning light nobody looks at any more. */}
        {data.overdue > 0 ? (
          <StatTile
            href="/factures"
            label="En retard"
            value={money(data.overdue)}
            tone="warning"
            hint={
              data.overdueInvoiceCount === 1
                ? "1 facture dont la date est passée"
                : `${data.overdueInvoiceCount} factures dont la date est passée`
            }
            icon={AlertTriangle}
          />
        ) : (
          <StatTile
            href="/achats"
            label="Dépensé ce mois-ci"
            value={money(data.spentThisMonth)}
            hint="Dépenses et frais sur les projets"
            icon={Receipt}
          />
        )}
        <StatTile
          href="/projets"
          label="Projets actifs"
          value={String(data.activeProjects)}
          hint={
            data.toInvoice > 0
              ? `${data.toInvoice} ${data.toInvoice === 1 ? "terminé à facturer" : "terminés à facturer"}`
              : "À faire ou commencés"
          }
          icon={FolderKanban}
        />
        <StatTile
          href="/temps"
          label="Heures cette semaine"
          value={hours(data.hoursThisWeek)}
          hint="Toute l'équipe, tous les chantiers"
          icon={Clock}
        />
        {/* The spending tile moves here when the overdue tile took its place above: six tiles
            either way, and the figure is never simply dropped. */}
        {data.overdue > 0 && (
          <StatTile
            href="/achats"
            label="Dépensé ce mois-ci"
            value={money(data.spentThisMonth)}
            hint="Dépenses et frais sur les projets"
            icon={Receipt}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">À surveiller</CardTitle>
          </CardHeader>
          <CardContent>
            {watch.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Rien en retard, rien en attente. Tout est à jour.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {watch.map((line) => {
                  const Icon = line.icon;
                  return (
                    <li key={line.key}>
                      <Link
                        href={line.href}
                        className="flex items-center gap-3 py-2.5 text-sm transition-colors hover:text-primary"
                      >
                        <Icon
                          className={cn(
                            "size-4 shrink-0",
                            line.urgent ? "text-destructive" : "text-muted-foreground",
                          )}
                        />
                        <span className="min-w-0 flex-1">{line.label(line.count)}</span>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Échéances</CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcomingTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune tâche datée. Les échéances se mettent sur la tâche, dans son projet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.upcomingTasks.map((task) => (
                  <li key={task.id}>
                    <Link
                      href={`/projets/${task.projectId}`}
                      className="flex items-center gap-3 py-2.5 text-sm transition-colors hover:text-primary"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{task.title}</span>
                        <span className="block font-mono text-xs tabular-nums text-muted-foreground">
                          {formatProjectNumber(task.projectNumber)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 whitespace-nowrap text-xs tabular-nums",
                          task.isLate ? "font-medium text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {task.dueDate ? formatDateOnly(task.dueDate) : "—"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <QuoteStatsCard />

      {data.recentInvoices.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Dernières factures</CardTitle>
            <Link
              href="/factures"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Toutes les factures
              <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numéro</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Solde</TableHead>
                  <TableHead>État</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono text-xs tabular-nums">
                      <Link href={`/factures/${invoice.id}`} className="underline-offset-4 hover:underline">
                        {invoice.number}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-48 truncate">{invoice.clientName}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateOnly(invoice.dueDate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{exactMoney(invoice.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {invoice.total - invoice.paid <= 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        exactMoney(invoice.total - invoice.paid)
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={invoiceStatusBadgeVariant[invoice.status]}>
                        {invoiceStatusLabels[invoice.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
