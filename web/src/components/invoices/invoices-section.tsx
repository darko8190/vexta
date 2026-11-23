"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { ClickableRow } from "@/components/layout/clickable-row";
import { UpgradeCta } from "@/components/layout/upgrade-cta";
import { useCanCreate, useIsClientUser } from "@/hooks/use-can-create";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useDeleteInvoice, useInvoicesQuery } from "@/hooks/use-invoices";
import { invoiceStatusBadgeVariant, invoiceStatusLabels } from "@/lib/labels";
import type { InvoiceRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency }).format(amount);
}

export function InvoicesSection() {
  const router = useRouter();
  const canCreate = useCanCreate();
  const isClient = useIsClientUser();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading } = useInvoicesQuery(page, debouncedSearch);
  const deleteInvoice = useDeleteInvoice();
  const [deleteTarget, setDeleteTarget] = useState<InvoiceRecord | undefined>(undefined);

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteInvoice.mutateAsync(deleteTarget.id);
      toast.success("Facture supprimée.");
      setDeleteTarget(undefined);
    } catch {
      toast.error("Impossible de supprimer cette facture.");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Factures</h2>
          <p className="text-sm text-muted-foreground">
            {isClient ? "Les factures qui vous sont adressées." : "Créez et suivez vos factures clients."}
          </p>
        </div>
        {canCreate ? (
          <Link href="/factures/nouvelle" className={cn(buttonVariants())}>
            <Plus />
            Nouvelle facture
          </Link>
        ) : isClient ? null : (
          <UpgradeCta />
        )}
      </div>

      <div className="mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Rechercher une facture…" />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={debouncedSearch ? "Aucune facture trouvée" : "Aucune facture pour l'instant"}
          description={
            debouncedSearch
              ? "Essayez une autre recherche."
              : canCreate
                ? "Créez votre première facture pour un client."
                : isClient
                  ? "Aucune facture ne vous est adressée pour l'instant."
                  : "La création de fiches est réservée aux comptes entreprise."
          }
          action={
            !debouncedSearch && !isClient &&
            (canCreate ? (
              <Link href="/factures/nouvelle" className={cn(buttonVariants())}>
                <Plus />
                Nouvelle facture
              </Link>
            ) : (
              <UpgradeCta />
            ))
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numéro</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Échéance</TableHead>
                <TableHead className="text-right">Total</TableHead>
                {/* Nothing to offer a customer here: every action behind it is refused. */}
                {!isClient && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((invoiceItem) => (
                <ClickableRow
                  key={invoiceItem.id}
                  label={`Ouvrir la facture ${invoiceItem.number}`}
                  onOpen={() => router.push(`/factures/${invoiceItem.id}`)}
                >
                  <TableCell className="font-medium">
                    <Link href={`/factures/${invoiceItem.id}`} className="hover:underline">
                      {invoiceItem.number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{invoiceItem.clientName}</TableCell>
                  <TableCell>
                    <Badge variant={invoiceStatusBadgeVariant[invoiceItem.status]}>
                      {invoiceStatusLabels[invoiceItem.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{invoiceItem.dueDate}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(invoiceItem.total, invoiceItem.currency)}
                  </TableCell>
                  {!isClient && (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem render={<Link href={`/factures/${invoiceItem.id}`} />}>
                          <FileText />
                          Ouvrir la facture
                        </DropdownMenuItem>
                        <DropdownMenuItem render={<Link href={`/factures/${invoiceItem.id}/modifier`} />}>
                          <Pencil />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(invoiceItem)}>
                          <Trash2 />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                  )}
                </ClickableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationBar result={data} onPageChange={setPage} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer cette facture ?"
        description={`La facture « ${deleteTarget?.number} » sera supprimée définitivement.`}
        onConfirm={confirmDelete}
        pending={deleteInvoice.isPending}
      />
    </div>
  );
}
