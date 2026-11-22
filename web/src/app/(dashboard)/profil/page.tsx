"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, MailCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/layout/page-header";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { userRoleLabels } from "@/lib/labels";

/**
 * Pattern 2 — Detail / Record: the one record is you.
 *
 * Nothing on this page is typed. The name and the address come from the account, and the only
 * action is asking for a reset link — the password is never changed here, because a form that
 * changes it from inside a live session changes it for whoever happens to be at the keyboard.
 * The link goes to the address on file, which is the confirmation.
 */
export default function ProfilePage() {
  const { user } = useAuth();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const requestReset = useMutation({
    mutationFn: () => api.post<{ message: string }>("auth/mot-de-passe/reinitialisation", {}),
    onSuccess: (data) => {
      setSentTo(data.message);
      toast.success("Courriel envoyé.");
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Le courriel n'a pas pu être envoyé. Réessayez dans quelques minutes.",
      );
    },
  });

  if (!user) return null;

  return (
    <div>
      <PageHeader title="Mon profil" description="Votre compte et votre mot de passe." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Votre compte</CardTitle>
            <CardDescription>Ces informations viennent de votre compte Vexta.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Nom</dt>
                <dd className="text-foreground">
                  {user.firstName} {user.lastName}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Courriel</dt>
                <dd className="break-all text-foreground">{user.email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Rôle</dt>
                <dd>
                  <Badge variant="secondary">{userRoleLabels[user.role]}</Badge>
                </dd>
              </div>
              {user.tenantName && (
                <div>
                  <dt className="text-muted-foreground">Espace</dt>
                  <dd className="text-foreground">{user.tenantName}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mot de passe</CardTitle>
            <CardDescription>
              Nous envoyons un lien à {user.email}. Le mot de passe actuel reste en place jusqu&apos;à
              ce que vous en choisissiez un nouveau depuis ce lien.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sentTo ? (
              <p
                className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
                role="status"
              >
                <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  {sentTo} Le lien est valide deux heures. Vérifiez aussi votre dossier de
                  courrier indésirable.
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Utile si vous l&apos;avez oublié, ou si vous pensez que quelqu&apos;un d&apos;autre
                le connaît.
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Button
              variant="outline"
              onClick={() => requestReset.mutate()}
              disabled={requestReset.isPending}
            >
              {requestReset.isPending ? <Spinner /> : <KeyRound />}
              {sentTo ? "Renvoyer le lien" : "Réinitialiser mon mot de passe"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
