"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, MoreHorizontal, Pencil, Plus, Send, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ClickableRow } from "@/components/layout/clickable-row";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { EmptyState } from "@/components/layout/empty-state";
import { EmployeeFormSheet } from "@/components/team/employee-form-sheet";
import { InvitationLinkDialog } from "@/components/team/invitation-link-dialog";
import {
  useDeleteEmployee,
  useGrantAccess,
  useResendInvitation,
  useRevokeAccess,
  useTeamQuery,
} from "@/hooks/use-team";
import { ApiError } from "@/lib/api";
import type { AccessGranted, Employee } from "@/lib/types";

function message(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/** The one cell that does something. Disabled with a reason rather than hidden. */
function AccessCell({
  employee,
  canGrant,
  blockedReason,
  onGrant,
  onRevoke,
  pending,
}: {
  employee: Employee;
  canGrant: boolean;
  blockedReason: string | null;
  onGrant: () => void;
  onRevoke: () => void;
  pending: boolean;
}) {
  // The owner's access is the account the space belongs to. Unticking it is refused by the
  // API, so the box says so rather than offering a thing that cannot happen.
  const disabled = pending || employee.isOwner || (!employee.hasAccess && !canGrant);
  const reason = employee.isOwner
    ? "Le propriétaire de l'entreprise garde son accès."
    : blockedReason;

  const box = (
    <Checkbox
      checked={employee.hasAccess}
      disabled={disabled}
      aria-label={`Accès à l'application pour ${employee.firstName} ${employee.lastName}`}
      onCheckedChange={(checked) => (checked === true ? onGrant() : onRevoke())}
    />
  );

  if (!disabled || !reason) {
    return box;
  }

  return (
    <Tooltip>
      {/* A disabled checkbox fires no pointer events, so the span is what the tooltip hangs on. */}
      <TooltipTrigger render={<span className="inline-flex" />}>{box}</TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

export function EmployeesSection() {
  const router = useRouter();
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } = useTeamQuery();
  const grantAccess = useGrantAccess();
  const revokeAccess = useRevokeAccess();
  const resendInvitation = useResendInvitation();
  const deleteEmployee = useDeleteEmployee();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Employee | undefined>(undefined);
  const [grant, setGrant] = useState<AccessGranted | null>(null);

  const seats = data?.seats;
  const employees = data?.employees ?? [];

  const blockedReason =
    seats?.limitReason ??
    (seats && !seats.hasRoom
      ? `Le forfait permet ${seats.limit} accès et ils sont tous utilisés.`
      : null);

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  async function onGrant(employee: Employee) {
    try {
      const result = await grantAccess.mutateAsync(employee.id);

      // No link means this address already had a Vexta account with a password — someone
      // rehired, or someone who already uses Vexta for their own space. There is nothing to
      // send, so the dialog would be an empty ceremony.
      if (!result.invitationUrl) {
        toast.success(
          `${employee.firstName} avait déjà un compte Vexta. L'entreprise apparaîtra dans ses espaces.`,
        );
        return;
      }

      setGrant(result);
    } catch (error) {
      toast.error(message(error, "Impossible de créer cet accès."));
    }
  }

  async function onRevoke(employee: Employee) {
    try {
      await revokeAccess.mutateAsync(employee.id);
      toast.success(`L'accès de ${employee.firstName} a été retiré. La fiche reste au dossier.`);
    } catch (error) {
      toast.error(message(error, "Impossible de retirer cet accès."));
    }
  }

  async function onResend(employee: Employee) {
    try {
      setGrant(await resendInvitation.mutateAsync(employee.id));
    } catch (error) {
      toast.error(message(error, "Impossible de renvoyer l'invitation."));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteEmployee.mutateAsync(deleteTarget.id);
      toast.success("Employé supprimé.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(message(error, "Impossible de supprimer cet employé."));
    }
  }

  const createButton = (
    <Button onClick={openCreate}>
      <Plus />
      Nouvel employé
    </Button>
  );

  const busy = grantAccess.isPending || revokeAccess.isPending || resendInvitation.isPending;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Employés</h2>
          <p className="text-sm text-muted-foreground">
            Cochez « Accès » pour qu&apos;une personne puisse se connecter à Vexta.
          </p>
        </div>
        {createButton}
      </div>

      {seats && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-medium tabular-nums text-foreground">
            {seats.used} / {seats.limit} accès utilisés
          </span>
          <span className="text-muted-foreground">
            {seats.limitReason ??
              (seats.remaining === 0
                ? "Retirez un accès ou changez de forfait pour en ajouter."
                : `${seats.remaining} encore ${seats.remaining > 1 ? "disponibles" : "disponible"}, vous compris.`)}
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        /* An error is not an empty list. Saying "aucun employé" when the request failed tells
           someone their payroll is empty, which is both false and alarming — and it was being
           said while the badge beside it still counted two.
           And `isError` alone is too wide: a failed background refetch keeps it true over rows
           that are still right, so the panel only wins with nothing read at all (`!data`) or rows
           left over from another query key (`isPlaceholderData`). */
        <LoadErrorState
          error={loadError}
          title="Employés indisponibles"
          fallback="Vos employés n'ont pas pu être chargés."
          onRetry={() => refetch()}
        />
      ) : employees.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Aucun employé pour l'instant"
          description="Ajoutez les gens qui travaillent chez vous. Une fiche n'occupe aucun accès tant que vous ne cochez pas la case."
          action={createButton}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employé</TableHead>
                <TableHead>Courriel</TableHead>
                <TableHead>Titre</TableHead>
                <TableHead className="w-20 text-center">Accès</TableHead>
                <TableHead className="w-40">État</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee) => (
                <ClickableRow
                  key={employee.id}
                  label={`Ouvrir la fiche de ${employee.firstName} ${employee.lastName}`}
                  onOpen={() => router.push(`/ressources-humaines/employes/${employee.id}`)}
                >
                  <TableCell className="font-medium">
                    <Link
                      href={`/ressources-humaines/employes/${employee.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {employee.firstName} {employee.lastName}
                    </Link>
                    {employee.isOwner && (
                      <div className="text-xs font-normal text-muted-foreground">Propriétaire</div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{employee.email}</TableCell>
                  <TableCell className="text-muted-foreground">{employee.jobTitle ?? "—"}</TableCell>
                  <TableCell className="text-center">
                    <AccessCell
                      employee={employee}
                      canGrant={Boolean(seats?.hasRoom)}
                      blockedReason={blockedReason}
                      onGrant={() => onGrant(employee)}
                      onRevoke={() => onRevoke(employee)}
                      pending={busy}
                    />
                  </TableCell>
                  <TableCell>
                    {!employee.hasAccess ? (
                      <span className="text-sm text-muted-foreground">Au dossier</span>
                    ) : employee.invitationExpired ? (
                      <Badge variant="destructive">Invitation expirée</Badge>
                    ) : employee.invitationPending ? (
                      <Badge variant="outline">Invitation envoyée</Badge>
                    ) : (
                      <Badge variant="default">Actif</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem render={<Link href={`/ressources-humaines/employes/${employee.id}`} />}>
                          <ExternalLink />
                          Ouvrir la fiche
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(employee);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil />
                          Modifier
                        </DropdownMenuItem>
                        {employee.invitationPending && (
                          <DropdownMenuItem onClick={() => onResend(employee)}>
                            <Send />
                            Renvoyer l&apos;invitation
                          </DropdownMenuItem>
                        )}
                        {!employee.isOwner && (
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(employee)}>
                            <Trash2 />
                            Supprimer
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </ClickableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <EmployeeFormSheet open={formOpen} onOpenChange={setFormOpen} employee={editing} />

      <InvitationLinkDialog
        grant={grant}
        recipientName={grant?.employee.firstName}
        recipientEmail={grant?.employee.email}
        onOpenChange={(open) => !open && setGrant(null)}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer cet employé ?"
        description={`La fiche de ${deleteTarget?.firstName} ${deleteTarget?.lastName} sera supprimée.${
          deleteTarget?.hasAccess ? " Son accès à Vexta sera retiré du même coup." : ""
        }`}
        onConfirm={confirmDelete}
        pending={deleteEmployee.isPending}
      />
    </div>
  );
}
