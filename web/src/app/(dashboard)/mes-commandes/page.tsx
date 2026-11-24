"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { useMyOrdersQuery } from "@/hooks/use-personal-profile";
import { customerOrderStatusBadgeVariant, customerOrderStatusLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import { formatMoment } from "@/lib/dates";

/**
 * Everything this person has ordered, from every company on Vexta.
 *
 * Pattern: List / Index. The question somebody opens it with is "where is my order", so the
 * state is on the row rather than a click away, and the rows are newest first — an order placed
 * this morning is the one being asked about.
 *
 * Nothing here is editable. Changing an order is a conversation with the company that is
 * picking it, and a button that appeared to cancel one without them knowing would be worse than
 * no button at all.
 */
export default function MyOrdersPage() {
  const { data, isLoading, isError, error, refetch } = useMyOrdersQuery();

  const orders = data ?? [];

  return (
    <div>
      <PageHeader
        title="Mes commandes"
        description="Ce que vous avez commandé aux entreprises de Vexta."
      />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : isError ? (
        <LoadErrorState error={error} onRetry={() => void refetch()} />
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <EmptyState
              icon={ShoppingBag}
              title="Aucune commande"
              description="Les commandes que vous passez sur la page d'une entreprise apparaissent ici. En attendant, les produits se trouvent dans Magasiner."
            />
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-2">
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {order.number}
                  <span className="font-normal text-muted-foreground">
                    {" · "}
                    {order.companySlug ? (
                      <Link href={`/e/${order.companySlug}`} className="hover:underline">
                        {order.companyName}
                      </Link>
                    ) : (
                      order.companyName
                    )}
                  </span>
                </p>
                <p className="truncate text-sm text-muted-foreground">{order.summary}</p>
                <p className="text-xs text-muted-foreground">{formatMoment(order.createdAt)}</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-medium tabular-nums text-foreground">
                    {formatAmount(order.total, order.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {order.lineCount === 1 ? "1 article" : `${order.lineCount} articles`}
                  </p>
                </div>

                <Badge variant={customerOrderStatusBadgeVariant[order.status]}>
                  {customerOrderStatusLabels[order.status]}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
