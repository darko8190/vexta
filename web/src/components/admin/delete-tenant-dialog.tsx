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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useDeleteTenant } from "@/hooks/use-tenants";
import { ApiError } from "@/lib/api";

/**
 * Deleting a space takes its clients, projects, invoices, products and people with it, and
 * nothing brings them back. So the name has to be typed: a confirmation that can be dismissed
 * with one reflex click is not a confirmation, and this button sits in a row beside "Entrer".
 */
export function DeleteTenantDialog({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const remove = useDeleteTenant();

  const matches = typed.trim() === name.trim();

  async function onDelete() {
    try {
      await remove.mutateAsync(id);
      toast.success(`« ${name} » a été supprimé.`);
      setOpen(false);
      setTyped("");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "La suppression a échoué.");
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Supprimer ${name}`}
      >
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
            <DialogTitle>Supprimer « {name} » ?</DialogTitle>
            <DialogDescription>
              Tout ce que cet espace contient part avec lui : ses clients, ses projets, ses
              factures, ses produits, ses employés et leurs accès. C&apos;est définitif.
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="confirm-tenant">
              Écrivez le nom pour confirmer
            </FieldLabel>
            <Input
              id="confirm-tenant"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={name}
              autoComplete="off"
            />
            <FieldDescription>
              Un abonnement Stripe continue de facturer : annulez-le dans Stripe.
            </FieldDescription>
          </Field>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={!matches || remove.isPending}
              onClick={onDelete}
            >
              {remove.isPending && <Spinner />}
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
