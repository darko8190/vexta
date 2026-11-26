"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, api } from "@/lib/api";

interface PayPalState {
  included: boolean;
  connected: boolean;
  clientId: string | null;
  sandbox: boolean;
}

/** PayPal is "set up" once connected; undefined while unknown or not in the plan. */
export function usePayPalStateQuery(enabled = true) {
  return useQuery({ queryKey: ["paypal"], queryFn: () => api.get<PayPalState>("paypal"), enabled });
}

/**
 * The company's own PayPal Business account. It creates a REST app on developer.paypal.com and
 * pastes its client id and secret here; Vexta checks them with PayPal before keeping them.
 * Invoices can then be paid with PayPal from the payment link, beside the card.
 */
export function PayPalCard() {
  const queryClient = useQueryClient();
  const { data, isLoading } = usePayPalStateQuery();
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [sandbox, setSandbox] = useState(false);

  const connect = useMutation({
    mutationFn: () => api.put<PayPalState>("paypal", { clientId, secret, sandbox }),
    onSuccess: (state) => {
      queryClient.setQueryData(["paypal"], state);
      setSecret("");
      toast.success("Compte PayPal branché.");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Impossible de brancher PayPal."),
  });

  const disconnect = useMutation({
    mutationFn: () => api.delete<PayPalState>("paypal"),
    onSuccess: (state) => {
      queryClient.setQueryData(["paypal"], state);
      toast.success("Compte PayPal débranché.");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Impossible de débrancher PayPal."),
  });

  if (isLoading || !data) return <Skeleton className="h-48 max-w-2xl" />;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="size-4" />
            PayPal
          </CardTitle>
          {data.connected && <Badge>{data.sandbox ? "Branché (test)" : "Branché"}</Badge>}
        </div>
        <CardDescription>
          Vos clients paient leurs factures avec PayPal, et l&apos;argent arrive dans votre compte PayPal Business.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {!data.included ? (
          <p className="text-sm text-muted-foreground">PayPal ne fait pas partie de votre forfait.</p>
        ) : data.connected ? (
          <p className="text-sm text-muted-foreground">
            Identifiant client : <span className="font-mono text-foreground">{data.clientId}</span>
          </p>
        ) : (
          <FieldGroup>
            <FieldDescription>
              Dans developer.paypal.com, ouvrez « Apps &amp; Credentials », créez une application REST et copiez son
              identifiant client et son secret.
            </FieldDescription>
            <Field>
              <FieldLabel htmlFor="paypal-client">Identifiant client (Client ID)</FieldLabel>
              <Input id="paypal-client" value={clientId} onChange={(event) => setClientId(event.target.value)} autoComplete="off" />
            </Field>
            <Field>
              <FieldLabel htmlFor="paypal-secret">Secret</FieldLabel>
              <Input
                id="paypal-secret"
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field orientation="horizontal">
              <Checkbox id="paypal-sandbox" checked={sandbox} onCheckedChange={(value) => setSandbox(Boolean(value))} />
              <FieldLabel htmlFor="paypal-sandbox" className="font-normal">
                Mode test (sandbox)
              </FieldLabel>
            </Field>
          </FieldGroup>
        )}
      </CardContent>

      {data.included && (
        <CardFooter className="gap-2">
          {data.connected ? (
            <Button variant="outline" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
              {disconnect.isPending && <Spinner />}
              Débrancher PayPal
            </Button>
          ) : (
            <Button
              onClick={() => connect.mutate()}
              disabled={connect.isPending || !clientId.trim() || !secret.trim()}
            >
              {connect.isPending && <Spinner />}
              Brancher PayPal
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
