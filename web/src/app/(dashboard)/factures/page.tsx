"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { PageHeader } from "@/components/layout/page-header";
import { UpgradeCta } from "@/components/layout/upgrade-cta";
import { useCanCreate } from "@/hooks/use-can-create";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useDeleteInvoice, useInvoicesQuery } from "@/hooks/use-invoices";
import { invoiceStatusBadgeVariant, invoiceStatusLabels } from "@/lib/labels";
import type { InvoiceRecord } from "@/lib/types";

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency }).format(amount);
}

export default function InvoicesPage() {
  const canCreate = useCanCreate();
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
      <PageHeader
        title="Factures"
        description="Créez et suivez vos factures clients."
        action={
          canCreate ? (
            <Button render={<Link href="/factures/nouvelle" />}>
              <Plus />
              Nouvelle facture
            </Button>
          ) : (
            <UpgradeCta />
          )
        }
      />

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
                : "La création de fiches est réservée aux comptes entreprise."
          }
          action={
            !debouncedSearch &&
            (canCreate ? (
              <Button render={<Link href="/factures/nouvelle" />}>
                <Plus />
                Nouvelle facture
              </Button>
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
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((invoiceItem) => (
                <TableRow key={invoiceItem.id}>
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
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem render={<Link href={`/factures/${invoiceItem.id}`} />}>
                          <Pencil />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(invoiceItem)}>
                          <Trash2 />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
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
