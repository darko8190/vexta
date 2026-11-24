"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { usePayOrder } from "@/hooks/use-orders";
import { useMyOrdersQuery } from "@/hooks/use-personal-profile";
import { api, ApiError } from "@/lib/api";
import { customerOrderStatusBadgeVariant, customerOrderStatusLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import { formatMoment } from "@/lib/dates";
import type { MyOrder } from "@/lib/types";

/**
 * Everything this person has ordered, from every company on Vexta.
 *
 * Pattern: List / Index. The question somebody opens it with is "where is my order", so the
 * state is on the row rather than a click away, and the rows are newest first — an order placed
 * this morning is the one being asked about.
 *
 * Nothing here is editable. Changing an order is a conversation with the company that is
 * picking it, and a button that appeared to cancel one without them knowing would be worse than
 * no button at all. The one exception is paying: an order still at the till is the customer's
 * own unfinished business, and finishing it changes nothing for anybody else.
 */
export default function MyOrdersPage() {
  return (
    <div>
      <PageHeader
        title="Mes commandes"
        description="Ce que vous avez commandé aux entreprises de Vexta."
      />

      {/* The list reads the query string, which Next needs a boundary for. */}
      <Suspense fallback={<Skeleton className="h-20 w-full" />}>
        <OrdersList />
      </Suspense>
    </div>
  );
}

function OrdersList() {
  const search = useSearchParams();
  const orderId = search.get("commande");
  const sessionId = search.get("session_id");
  const returning = Boolean(orderId && sessionId);

  // The settlement runs as a query rather than in an effect, keyed on the session so it runs
  // once per return from Stripe. It is asked before the list is read: somebody sent back here
  // is looking for the row that was just paid, and a list fetched first would show yesterday's
  // answer and then jump.
  const confirmation = useQuery({
    queryKey: ["commande", "confirmation", orderId, sessionId],
    queryFn: () =>
      api.post<{ paid: boolean }>(`boutique/commandes/${orderId}/confirmation`, { sessionId }),
    enabled: returning,
    retry: false,
  });

  const settling = returning && confirmation.isPending;

  const { data, isLoading, isError, error, refetch } = useMyOrdersQuery(!settling);

  const orders = data ?? [];

  return (
    <div className="space-y-4">
      {settling && (
        <Alert>
          <Spinner className="size-4" />
          <AlertTitle>Nous confirmons votre paiement</AlertTitle>
          <AlertDescription>Un instant, nous demandons à Stripe où il en est.</AlertDescription>
        </Alert>
      )}

      {returning && !settling && confirmation.data?.paid === true && (
        <Alert>
          <CreditCard />
          <AlertTitle>Paiement reçu</AlertTitle>
          <AlertDescription>
            Votre commande est payée et l&apos;entreprise l&apos;a reçue. Votre reçu vous arrive
            par courriel.
          </AlertDescription>
        </Alert>
      )}

      {returning && !settling && confirmation.data?.paid !== true && (
        <Alert variant="destructive">
          <CreditCard />
          <AlertTitle>Paiement non confirmé</AlertTitle>
          <AlertDescription>
            Si vous venez de payer, laissez-nous une minute et rechargez la page. Rien ne sera
            pris deux fois : votre commande ci-dessous vous dira où elle en est.
          </AlertDescription>
        </Alert>
      )}

      {isLoading || settling ? (
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
            <OrderRow key={order.id} order={order} />
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderRow({ order }: { order: MyOrder }) {
  const pay = usePayOrder();
  const [leaving, setLeaving] = useState(false);

  const unpaid = order.status === "EnAttenteDePaiement";

  async function resume() {
    try {
      const { url } = await pay.mutateAsync(order.id);
      // The button stays busy until the browser leaves: a page that looked idle for the second
      // Stripe takes to answer is a page somebody presses twice.
      setLeaving(true);
      window.location.href = url;
    } catch (failure) {
      toast.error(
        failure instanceof ApiError ? failure.message : "Le paiement n'a pas pu être rouvert.",
      );
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
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
        <p className="text-xs text-muted-foreground">
          {formatMoment(order.createdAt)}
          {order.paidAt && ` · payée le ${formatMoment(order.paidAt)}`}
        </p>
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

        {unpaid ? (
          <Button size="sm" disabled={pay.isPending || leaving} onClick={() => void resume()}>
            {(pay.isPending || leaving) && <Spinner />}
            Payer
          </Button>
        ) : (
          <Badge variant={customerOrderStatusBadgeVariant[order.status]}>
            {customerOrderStatusLabels[order.status]}
          </Badge>
        )}
      </div>
    </li>
  );
}
