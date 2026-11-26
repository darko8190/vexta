"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import {
  equipmentStatusLabels,
  equipmentUnitLabels,
  formatEquipmentNumber,
  useSaveEquipment,
  type Equipment,
  type EquipmentStatus,
  type EquipmentUnit,
} from "@/hooks/use-equipment";
import { ApiError } from "@/lib/api";
import { ex } from "@/lib/placeholders";

/** "32", "32,50" or nothing. Undefined when what was typed is not a number. */
export function parseRate(value: string): number | null | undefined {
  const typed = value.replace(/\s/g, "").replace(",", ".");
  if (typed === "") return null;
  const n = Number(typed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function rateText(value: number | null | undefined): string {
  return value == null ? "" : String(value).replace(".", ",");
}

/** One piece of equipment, created or edited. Remounted on each opening by its caller. */
export function EquipmentFormSheet({
  open,
  onOpenChange,
  equipment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment?: Equipment;
}) {
  const save = useSaveEquipment();
  const [name, setName] = useState(equipment?.name ?? "");
  const [serial, setSerial] = useState(equipment?.serialNumber ?? "");
  const [description, setDescription] = useState(equipment?.description ?? "");
  const [unit, setUnit] = useState<EquipmentUnit>(equipment?.unit ?? "Heure");
  const [cost, setCost] = useState(rateText(equipment?.costRate));
  const [selling, setSelling] = useState(rateText(equipment?.sellingRate));
  const [status, setStatus] = useState<EquipmentStatus>(equipment?.status ?? "Disponible");
  const [rented, setRented] = useState(equipment?.isRented ?? false);
  const [notes, setNotes] = useState(equipment?.notes ?? "");
  const [tried, setTried] = useState(false);

  const costValue = parseRate(cost);
  const sellingValue = parseRate(selling);
  const valid = name.trim().length > 0 && costValue !== undefined && sellingValue !== undefined;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTried(true);
    if (!valid) return;
    try {
      await save.mutateAsync({
        id: equipment?.id,
        values: {
          name: name.trim(),
          serialNumber: serial.trim() || null,
          description: description.trim() || null,
          unit,
          costRate: costValue ?? null,
          sellingRate: sellingValue ?? null,
          status,
          isRented: rented,
          notes: notes.trim() || null,
        },
      });
      toast.success(equipment ? "Équipement mis à jour." : "Équipement ajouté.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer l'équipement.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{equipment ? "Modifier l'équipement" : "Nouvel équipement"}</SheetTitle>
          <SheetDescription>
            {equipment
              ? `${formatEquipmentNumber(equipment.number)} — numéro attribué automatiquement.`
              : "Une machine ou un outil que vous facturez au temps sur vos projets."}
          </SheetDescription>
        </SheetHeader>

        <form id="equipment-form" className="flex-1 overflow-y-auto px-4" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={tried && !name.trim()}>
              <FieldLabel htmlFor="equipment-name">
                Nom
                <RequiredMark />
              </FieldLabel>
              <Input
                id="equipment-name"
                value={name}
                maxLength={200}
                placeholder={ex("Nacelle à ciseaux 19 pi")}
                aria-invalid={tried && !name.trim()}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="equipment-serial">Numéro de série</FieldLabel>
              <Input id="equipment-serial" value={serial} maxLength={100} onChange={(event) => setSerial(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="equipment-unit">Facturé à la</FieldLabel>
              <Select value={unit} onValueChange={(value) => value && setUnit(value as EquipmentUnit)}>
                <SelectTrigger id="equipment-unit" className="w-full">
                  <SelectValue>{(value: EquipmentUnit) => equipmentUnitLabels[value]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(equipmentUnitLabels) as EquipmentUnit[]).map((value) => (
                    <SelectItem key={value} value={value}>
                      {equipmentUnitLabels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={costValue === undefined}>
                <FieldLabel htmlFor="equipment-cost">Coûtant ($ / {equipmentUnitLabels[unit]})</FieldLabel>
                <Input
                  id="equipment-cost"
                  inputMode="decimal"
                  value={cost}
                  aria-invalid={costValue === undefined}
                  onChange={(event) => setCost(event.target.value)}
                />
              </Field>
              <Field data-invalid={sellingValue === undefined}>
                <FieldLabel htmlFor="equipment-selling">Vendant ($ / {equipmentUnitLabels[unit]})</FieldLabel>
                <Input
                  id="equipment-selling"
                  inputMode="decimal"
                  value={selling}
                  aria-invalid={sellingValue === undefined}
                  onChange={(event) => setSelling(event.target.value)}
                />
              </Field>
            </div>
            <FieldDescription className="-mt-3">
              Repris sur chaque ligne d&apos;un projet, et modifiables là. Un taux pas encore établi peut rester vide.
            </FieldDescription>
            <Field>
              <FieldLabel htmlFor="equipment-status">État</FieldLabel>
              <Select value={status} onValueChange={(value) => value && setStatus(value as EquipmentStatus)}>
                <SelectTrigger id="equipment-status" className="w-full">
                  <SelectValue>{(value: EquipmentStatus) => equipmentStatusLabels[value]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(equipmentStatusLabels) as EquipmentStatus[]).map((value) => (
                    <SelectItem key={value} value={value}>
                      {equipmentStatusLabels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field orientation="horizontal">
              <Checkbox id="equipment-rented" checked={rented} onCheckedChange={(checked) => setRented(checked === true)} />
              <FieldLabel htmlFor="equipment-rented" className="font-normal">
                Loué (n&apos;appartient pas à l&apos;entreprise)
              </FieldLabel>
            </Field>
            <Field>
              <FieldLabel htmlFor="equipment-description">Description</FieldLabel>
              <Textarea id="equipment-description" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="equipment-notes">Notes</FieldLabel>
              <Textarea id="equipment-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="equipment-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {equipment ? "Enregistrer" : "Ajouter l'équipement"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
