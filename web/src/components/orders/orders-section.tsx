"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Search, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ClickableCard } from "@/components/layout/clickable-card";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { OrderSheet } from "@/components/orders/order-sheet";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useOrdersQuery } from "@/hooks/use-orders";
import { ApiError } from "@/lib/api";
import { customerOrderStatusBadgeVariant, customerOrderStatusLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import { formatMoment } from "@/lib/dates";
import type { CustomerOrderStatus } from "@/lib/types";

/** The states, in the order an order passes through them. */
const STATES: CustomerOrderStatus[] = [
  "Recue",
  "EnPreparation",
  "Prete",
  "Livree",
  "Annulee",
];

/**
 * The orders that came in through the public page.
 *
 * Pattern: List / Index. Newest first and nothing collapsed, because the question somebody
 * opens this with is "what came in", and an order that arrived an hour ago is the one being
 * asked about.
 *
 * Not grouped by state. Five headings would push Reçue — the only one that needs doing
 * anything about — below a screenful of orders that are already finished.
 */
export function OrdersSection() {
  const [status, setStatus] = useState<CustomerOrderStatus | "">("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const debounced = useDebouncedValue(search, 300);

  const { data, isLoading, isError, error, refetch } = useOrdersQuery(status, debounced);

  const orders = data ?? [];

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Commandes</h2>
        <p className="text-sm text-muted-foreground">
          Ce que vos clients ont commandé sur votre page publique.
        </p>
      </div>

      <div className="mb-4 space-y-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Numéro, client…"
            aria-label="Rechercher une commande"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="État">
          <Button
            type="button"
            size="sm"
            variant={status === "" ? "default" : "outline"}
            onClick={() => setStatus("")}
          >
            Toutes
          </Button>
          {STATES.map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={status === item ? "default" : "outline"}
              onClick={() => setStatus(item)}
            >
              {customerOrderStatusLabels[item]}
            </Button>
          ))}
        </div>
      </div>

      {isLoading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Commandes indisponibles"
          fallback="Les commandes n'ont pas pu être chargées."
          onRetry={() => void refetch()}
        />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title={
            debounced || status ? "Aucune commande ne correspond" : "Aucune commande pour le moment"
          }
          description={
            debounced || status
              ? "Essayez un autre mot, ou retirez le filtre."
              : "Activez « Accepter les commandes en ligne » sur votre page publique, et ce que vos clients commandent arrivera ici."
          }
        />
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <ClickableCard
              key={order.id}
              className="flex flex-wrap items-start gap-3 rounded-lg border border-border bg-card p-3"
              label={`Ouvrir la commande ${order.number}`}
              onOpen={() => setOpenId(order.id)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{order.number}</span>
                  <Badge variant={customerOrderStatusBadgeVariant[order.status]}>
                    {customerOrderStatusLabels[order.status]}
                  </Badge>
                  {order.invoiceNumber && (
                    <Badge variant="outline">
                      <FileText className="size-3" />
                      {order.invoiceNumber}
                    </Badge>
                  )}
                </div>

                <p className="mt-0.5 text-sm text-muted-foreground">
                  <Link
                    href={`/clients/${order.clientId}`}
                    className="hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {order.clientName}
                  </Link>
                  {order.contactPhone && ` · ${order.contactPhone}`}
                </p>

                <p className="text-xs text-muted-foreground">{formatMoment(order.createdAt)}</p>
              </div>

              <div className="text-right">
                <p className="font-medium tabular-nums text-foreground">
                  {formatAmount(order.total, order.currency)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {order.lineCount === 1 ? "1 article" : `${order.lineCount} articles`}
                </p>
              </div>
            </ClickableCard>
          ))}
        </div>
      )}

      {openId && (
        <OrderSheet
          open={Boolean(openId)}
          onOpenChange={(next) => !next && setOpenId(undefined)}
          orderId={openId}
          onInvoiced={(number) => toast.success(`Facture ${number} créée en brouillon.`)}
          onFailed={(failure) =>
            toast.error(
              failure instanceof ApiError ? failure.message : "L'opération a échoué.",
            )
          }
        />
      )}
    </div>
  );
}
