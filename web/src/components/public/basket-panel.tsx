"use client";

import { useState } from "react";
import { CheckCircle2, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { SignInToOrder } from "@/components/public/public-account-bar";
import { useBasket } from "@/hooks/use-basket";
import { useOrderEligibilityQuery, usePlaceOrder } from "@/hooks/use-orders";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { ex } from "@/lib/placeholders";

const money = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" });

/**
 * The button that puts a product in the basket.
 *
 * Its own small component so the product card stays a card: everything about what a basket is
 * lives in the hook, and the card only has to know which product it is showing.
 */
export function AddToBasketButton({
  slug,
  product,
}: {
  slug: string;
  product: { id: string; title: string; unit: string | null; sellingPrice: number | null };
}) {
  const basket = useBasket(slug);
  // How many go in with the next press. Typed or stepped, and back to one once they are in.
  const [quantity, setQuantity] = useState(1);

  // A product with no price is "prix sur demande" on the page, and the API refuses it on an
  // order: the customer would be agreeing to a figure nobody has named. No button, rather than
  // a button that is refused after they have filled in a delivery note.
  if (product.sellingPrice === null) return null;

  const inBasket = basket.items.find((line) => line.productId === product.id);
  const valid = Number.isInteger(quantity) && quantity >= 1 && quantity <= 10_000;

  return (
    <div className="mt-3 flex items-center gap-1.5">
      <div className="flex shrink-0 items-center rounded-lg border border-input">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Un de moins"
          disabled={quantity <= 1}
          onClick={() => setQuantity((value) => Math.max(1, value - 1))}
        >
          <Minus className="size-3.5" />
        </Button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={10000}
          value={Number.isNaN(quantity) ? "" : quantity}
          onChange={(event) => setQuantity(Math.floor(Number(event.target.value)))}
          aria-label={`Quantité de ${product.title}`}
          className="w-10 [appearance:textfield] bg-transparent text-center text-sm tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Un de plus"
          onClick={() => setQuantity((value) => (Number.isNaN(value) ? 1 : value + 1))}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      <Button
        type="button"
        variant={inBasket ? "secondary" : "outline"}
        size="sm"
        className="min-w-0 flex-1"
        disabled={!valid}
        onClick={() => {
          basket.add(
            {
              productId: product.id,
              title: product.title,
              unit: product.unit,
              unitPrice: product.sellingPrice ?? 0,
            },
            quantity,
          );
          setQuantity(1);
        }}
      >
        <ShoppingBag className="size-4" />
        <span className="truncate">{inBasket ? `Ajouter (${inBasket.quantity} au panier)` : "Ajouter"}</span>
      </Button>
    </div>
  );
}

/**
 * The basket, and the order that comes out of it.
 *
 * A button in the bar that stays at the top right of the window while the visitor scrolls,
 * where every shop keeps it: somebody adding a fourth item is halfway down a catalogue, and a
 * basket they have to scroll back to find is a basket they forget they have.
 *
 * Ordering needs an account — the dialog says so plainly to a visitor who has none, and offers
 * the same sign-in as applying for a job rather than a second one of its own.
 */
export function BasketPanel({ slug, companyName }: { slug: string; companyName: string }) {
  const { user } = useAuth();
  const basket = useBasket(slug);
  const place = usePlaceOrder();

  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Asked only once the dialog is open and there is somebody to ask about. A visitor reading
  // the page has not yet asked a question that needs answering.
  const eligibility = useOrderEligibilityQuery(slug, open && Boolean(user));

  // What the company has on file, unless this person has typed something else for this order.
  const phoneValue = phoneTouched ? phone : phone || (eligibility.data?.contactPhone ?? "");

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;

    setError(null);
    setDone(null);
  }

  async function send() {
    setError(null);

    try {
      const result = await place.mutateAsync({
        slug,
        lines: basket.items.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
        })),
        note: note.trim() || null,
        contactPhone: phoneValue.trim() || null,
      });

      // Emptied only once the API has the order. A network failure that cleared the basket
      // would cost somebody the twenty minutes they spent filling it.
      basket.clear();
      setNote("");

      if (result.paymentUrl) {
        // Straight to the till. Not a link to press: somebody who has just agreed to pay has
        // made the decision, and a second button between them and the card form is a place to
        // change their mind about something they already decided.
        window.location.href = result.paymentUrl;
        return;
      }

      setDone(result.message);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Votre commande n'a pas pu être envoyée.",
      );
    }
  }

  const ready = Boolean(user) && eligibility.data?.canOrder === true;

  // Said before the button rather than discovered after it: "Commander" and "Payer et
  // commander" are two different promises, and somebody about to be sent to a card form has a
  // right to know that before they press.
  const requiresPayment = eligibility.data?.requiresPayment === true;

  return (
    <>
      <Button
        type="button"
        variant={basket.count > 0 ? "default" : "outline"}
        size="sm"
        onClick={() => onOpenChange(true)}
        aria-label={`Mon panier, ${basket.count} article${basket.count > 1 ? "s" : ""}`}
      >
        <ShoppingBag className="size-4" aria-hidden="true" />
        <span className="tabular-nums">{basket.count}</span>
        {basket.count > 0 && (
          <span className="hidden tabular-nums sm:inline">· {money.format(basket.subtotal)}</span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mon panier — {companyName}</DialogTitle>
            <DialogDescription>
              {!user
                ? "Il faut un compte Vexta pour commander."
                : requiresPayment
                  ? "Vous payez par carte maintenant. La livraison se règle avec l'entreprise."
                  : "L'entreprise vous confirmera le prix final et la livraison."}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto px-4">
            {done ? (
              <Alert>
                <CheckCircle2 />
                <AlertDescription>{done}</AlertDescription>
              </Alert>
            ) : !user ? (
              <SignInToOrder slug={slug} />
            ) : basket.items.length === 0 && !done ? (
              <p className="py-4 text-sm text-muted-foreground">
                Votre panier est vide. Ajoutez un produit pour commander.
              </p>
            ) : eligibility.isLoading ? (
              <p className="py-4 text-sm text-muted-foreground">Un instant…</p>
            ) : eligibility.data?.canOrder === false ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {eligibility.data.refusal ??
                    "Cette entreprise ne prend pas de commandes en ligne pour le moment."}
                </AlertDescription>
              </Alert>
            ) : (
              <FieldGroup>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <ul className="divide-y divide-border">
                  {basket.items.map((line) => (
                    <li key={line.productId} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{line.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {money.format(line.unitPrice)}
                          {line.unit ? ` / ${line.unit}` : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Retirer un ${line.title}`}
                          onClick={() => basket.setQuantity(line.productId, line.quantity - 1)}
                        >
                          <Minus className="size-4" />
                        </Button>
                        <span className="w-8 text-center text-sm tabular-nums">{line.quantity}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Ajouter un ${line.title}`}
                          onClick={() => basket.setQuantity(line.productId, line.quantity + 1)}
                        >
                          <Plus className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Retirer ${line.title} du panier`}
                          onClick={() => basket.remove(line.productId)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>

                      <p className="w-20 text-right text-sm font-medium tabular-nums text-foreground">
                        {money.format(line.quantity * line.unitPrice)}
                      </p>
                    </li>
                  ))}
                </ul>

                <p className="text-right text-sm text-foreground">
                  Sous-total : <strong className="tabular-nums">{money.format(basket.subtotal)}</strong>
                  <span className="block text-xs text-muted-foreground">
                    {requiresPayment
                      ? "Les taxes s'ajoutent au paiement. La livraison se règle avec l'entreprise."
                      : "Les taxes et la livraison s'ajoutent sur la facture."}
                  </span>
                </p>

                <Field>
                  <FieldLabel htmlFor="order-phone">Téléphone</FieldLabel>
                  <Input
                    id="order-phone"
                    value={phoneValue}
                    onChange={(event) => {
                      setPhoneTouched(true);
                      setPhone(event.target.value);
                    }}
                    placeholder={ex("418 555-0199")}
                  />
                  <FieldDescription>
                    Le numéro où vous joindre pour cette commande.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="order-note">Un mot à l&apos;entreprise</FieldLabel>
                  <Textarea
                    id="order-note"
                    rows={3}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder={ex("Livraison au chantier, rue Saint-Jean. Avant vendredi si possible.")}
                  />
                  <FieldDescription>
                    Optionnel. Une adresse de livraison, une date, une question.
                  </FieldDescription>
                </Field>
              </FieldGroup>
            )}
          </div>

          <DialogFooter>
            {ready && !done && basket.items.length > 0 ? (
              <>
                <Button type="button" onClick={() => void send()} disabled={place.isPending}>
                  {place.isPending && <Spinner />}
                  {requiresPayment ? "Payer et commander" : "Envoyer ma commande"}
                </Button>
                <DialogClose render={<Button type="button" variant="outline" />}>
                  Continuer mes achats
                </DialogClose>
              </>
            ) : (
              <DialogClose render={<Button type="button" variant="outline" />}>Fermer</DialogClose>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
