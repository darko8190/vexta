"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useDeleteAdminUser, type AdminUser } from "@/hooks/use-admin-users";
import { ApiError } from "@/lib/api";

/**
 * Deleting an account cannot be undone, so the address has to be typed, as the company's name
 * is for deleting a company: one reflex click is not a confirmation.
 */
export function DeleteUserDialog({ user }: { user: AdminUser }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const remove = useDeleteAdminUser();
  const name = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const matches = typed.trim().toLowerCase() === user.email.trim().toLowerCase();

  async function onDelete() {
    try {
      await remove.mutateAsync(user.id);
      toast.success(`Le compte de ${name} a été supprimé.`);
      setOpen(false);
      setTyped("");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "La suppression a échoué.");
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label={`Supprimer le compte de ${name}`}>
        <Trash2 />
        Supprimer
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setTyped("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer le compte de {name} ?</DialogTitle>
            <DialogDescription>
              Le compte ne pourra plus se connecter, et son espace personnel est supprimé avec lui.
              Les fiches que les entreprises ont sur cette personne (employé, client) restent, sans
              accès. C&apos;est définitif.
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="confirm-user">Écrivez le courriel pour confirmer</FieldLabel>
            <Input
              id="confirm-user"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={user.email}
              autoComplete="off"
            />
          </Field>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
            <Button type="button" variant="destructive" disabled={!matches || remove.isPending} onClick={onDelete}>
              {remove.isPending && <Spinner />}
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
