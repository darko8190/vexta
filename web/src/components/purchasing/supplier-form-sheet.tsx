"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { RequiredMark } from "@/components/ui/required-mark";
import { CountrySelect, SubdivisionField } from "@/components/addresses/country-field";
import { SupplierDirectorySearch } from "@/components/purchasing/supplier-directory-search";
import { useSaveSupplier } from "@/hooks/use-suppliers";
import { defaultCountryName, isKnownSubdivision, subdivisionLabel } from "@/lib/geo";
import { ApiError } from "@/lib/api";
import { ex } from "@/lib/placeholders";
import type { Supplier } from "@/lib/types";

/**
 * A supplier's card.
 *
 * Deliberately short. What matters about a yard is how to reach it and what has been ordered
 * from it; a card with twenty empty fields is a card nobody fills in.
 */
export function SupplierFormSheet({
  open,
  onOpenChange,
  supplier,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier;
}) {
  const isEditing = Boolean(supplier);
  const save = useSaveSupplier();

  const [name, setName] = useState(supplier?.name ?? "");
  const [contactName, setContactName] = useState(supplier?.contactName ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [website, setWebsite] = useState(supplier?.website ?? "");
  const [accountNumber, setAccountNumber] = useState(supplier?.accountNumber ?? "");
  const [line1, setLine1] = useState(supplier?.line1 ?? "");
  const [city, setCity] = useState(supplier?.city ?? "");
  const [province, setProvince] = useState(supplier?.province ?? "Québec");
  const [country, setCountry] = useState(supplier?.country ?? defaultCountryName);
  const [postalCode, setPostalCode] = useState(supplier?.postalCode ?? "");
  const [notes, setNotes] = useState(supplier?.notes ?? "");
  const [isActive, setIsActive] = useState(supplier?.isActive ?? true);

  async function onSubmit() {
    if (!name.trim()) {
      toast.error("Le nom du fournisseur est obligatoire.");
      return;
    }

    // The address is what connects this supplier to its own Vexta account the day it signs up,
    // so it is required rather than nice to have. Checked here as well as on the server so the
    // answer is immediate; an existing card that never had one is left alone, which is the rule
    // the server applies too.
    const addressRequired = !isEditing || Boolean(supplier?.line1);
    if (addressRequired && (!line1.trim() || !city.trim() || !postalCode.trim() || !country.trim())) {
      toast.error("L'adresse du fournisseur est obligatoire.");
      return;
    }

    try {
      await save.mutateAsync({
        id: supplier?.id ?? null,
        values: {
          name: name.trim(),
          contactName: contactName.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          website: website.trim() || null,
          accountNumber: accountNumber.trim() || null,
          line1: line1.trim() || null,
          city: city.trim() || null,
          province: province.trim() || null,
          postalCode: postalCode.trim() || null,
          country: country.trim() || null,
          notes: notes.trim() || null,
          isActive,
        },
      });
      toast.success(isEditing ? "Fournisseur mis à jour." : "Fournisseur ajouté.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer ce fournisseur.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier le fournisseur" : "Nouveau fournisseur"}</SheetTitle>
          <SheetDescription>
            Une cour, un grossiste, une boutique de location — quelqu&apos;un chez qui vous achetez.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <FieldGroup>
            {/* Only when adding. On an existing card the fields are the record, and a search
                that overwrote them would undo work somebody did on purpose. */}
            {!isEditing && (
              <SupplierDirectorySearch
                onPick={(entry) => {
                  setName(entry.name);
                  // Only the empty ones for the contact details: somebody who typed a direct
                  // line before searching meant that number.
                  setEmail((current) => current || entry.email || "");
                  setPhone((current) => current || entry.phone || "");
                  setLine1(entry.line1 ?? "");
                  setCity(entry.city ?? "");
                  setProvince(entry.province ?? "");
                  setPostalCode(entry.postalCode ?? "");
                  setCountry(entry.country ?? defaultCountryName);
                }}
              />
            )}

            <Field>
              <FieldLabel htmlFor="supplier-name">
                Nom
                <RequiredMark />
              </FieldLabel>
              <Input
                id="supplier-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={ex("Matériaux Lévis")}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="supplier-contact">Personne-ressource</FieldLabel>
                <Input
                  id="supplier-contact"
                  value={contactName}
                  onChange={(event) => setContactName(event.target.value)}
                  placeholder={ex("Sylvie au comptoir")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-account">Numéro de compte</FieldLabel>
                <Input
                  id="supplier-account"
                  value={accountNumber}
                  onChange={(event) => setAccountNumber(event.target.value)}
                  placeholder={ex("CL-4821")}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="supplier-phone">Téléphone</FieldLabel>
                <Input
                  id="supplier-phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder={ex("418 555-0100")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-email">Courriel</FieldLabel>
                <Input
                  id="supplier-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={ex("commandes@materiauxlevis.ca")}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="supplier-website">Site web</FieldLabel>
              <Input
                id="supplier-website"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder={ex("https://materiauxlevis.ca")}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="supplier-line1">
                Adresse
                <RequiredMark />
              </FieldLabel>
              <Input
                id="supplier-line1"
                value={line1}
                onChange={(event) => setLine1(event.target.value)}
                placeholder={ex("450 boulevard de la Rive-Sud")}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="supplier-city">
                  Ville
                  <RequiredMark />
                </FieldLabel>
                <Input
                  id="supplier-city"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder={ex("Lévis")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-country">Pays</FieldLabel>
                <CountrySelect
                  id="supplier-country"
                  value={country}
                  onChange={(next) => {
                    setCountry(next);
                    // A province the new country does not have cannot stay behind: this address
                    // is what a supplier will be recognised by when they join Vexta themselves.
                    if (!isKnownSubdivision(next, province)) setProvince("");
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-province">{subdivisionLabel(country)}</FieldLabel>
                <SubdivisionField
                  id="supplier-province"
                  value={province}
                  onChange={setProvince}
                  countryName={country}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-postal">
                  Code postal
                  <RequiredMark />
                </FieldLabel>
                <Input
                  id="supplier-postal"
                  value={postalCode}
                  onChange={(event) => setPostalCode(event.target.value)}
                  placeholder={ex("G6V 1A1")}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="supplier-notes">Notes</FieldLabel>
              <Textarea
                id="supplier-notes"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={ex("Livraison gratuite au-dessus de 500 $.")}
              />
            </Field>

            <Field orientation="horizontal">
              <Checkbox
                id="supplier-active"
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
              />
              <FieldLabel htmlFor="supplier-active">Fournisseur actif</FieldLabel>
            </Field>
            <FieldDescription>
              Décocher le retire des listes de choix sans l&apos;effacer : les commandes passées
              chez lui doivent continuer de dire chez qui elles ont été passées.
            </FieldDescription>
          </FieldGroup>
        </div>

        <SheetFooter>
          <Button type="button" onClick={onSubmit} disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {isEditing ? "Enregistrer" : "Ajouter le fournisseur"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
