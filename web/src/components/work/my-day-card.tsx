"use client";

import { useState } from "react";
import { Play, Square } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { hoursText, timeOfDay } from "@/components/work/work-days-table";
import { useEndDay, useStartDay, type MyDay } from "@/hooks/use-work-days";
import { ApiError } from "@/lib/api";

/**
 * The day, started and ended by the employee: the feuille de temps de jour. Shown above the
 * assignments, which open only once the day is under way — the day comes first, the poinçons
 * on each job go inside it.
 */
export function MyDayCard({ day }: { day: MyDay }) {
  const start = useStartDay();
  const end = useEndDay();
  const [endOpen, setEndOpen] = useState(false);
  const [pause, setPause] = useState("30");
  const [note, setNote] = useState("");
  const today = day.today;
  const running = today && !today.endedAt;

  async function onStart() {
    try {
      await start.mutateAsync();
      toast.success(today ? "Journée reprise." : "Bonne journée !");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de commencer la journée.");
    }
  }

  async function onEnd() {
    const minutes = Number(pause || "0");
    try {
      await end.mutateAsync({ breakMinutes: Number.isFinite(minutes) ? minutes : 0, note: note.trim() || null });
      toast.success("Journée terminée.");
      setEndOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de terminer la journée.");
    }
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          {!today ? "Votre journée n'est pas commencée" : running ? "Journée en cours" : "Journée terminée"}
        </p>
        <p className="text-sm text-muted-foreground">
          {!today
            ? "Commencez-la pour ouvrir vos assignations et pointer vos heures sur les projets."
            : `Depuis ${timeOfDay(today.startedAt)}${today.endedAt ? ` jusqu'à ${timeOfDay(today.endedAt)}` : ""} · ${hoursText(today.hours)} · ${hoursText(today.projectHours)} pointées sur des projets`}
        </p>
      </div>
      {running ? (
        <Button variant="outline" onClick={() => setEndOpen(true)}>
          <Square />
          Terminer ma journée
        </Button>
      ) : (
        <Button size="lg" onClick={onStart} disabled={start.isPending}>
          {start.isPending ? <Spinner /> : <Play />}
          {today ? "Reprendre ma journée" : "Commencer ma journée"}
        </Button>
      )}

      <Dialog open={endOpen} onOpenChange={setEndOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Terminer la journée</DialogTitle>
            <DialogDescription>Les pauses non payées sont retirées du total de la journée.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="day-pause">Pauses (minutes)</FieldLabel>
            <Input id="day-pause" inputMode="numeric" value={pause} onChange={(e) => setPause(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field>
            <FieldLabel htmlFor="day-note">Note</FieldLabel>
            <Textarea id="day-note" rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
            <Button onClick={onEnd} disabled={end.isPending}>
              {end.isPending && <Spinner />}
              Terminer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
