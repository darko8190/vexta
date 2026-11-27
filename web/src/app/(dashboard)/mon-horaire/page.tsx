"use client";

import { CalendarRange } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PlanningCalendar } from "@/components/schedule/planning-calendar";
import { useMyEmployeeQuery } from "@/hooks/use-my-employee";

/** The employee's own week: where they are expected, and when. Read only. */
export default function MySchedulePage() {
  const { data: me, isLoading } = useMyEmployeeQuery();
  return (
    <div>
      <PageHeader title="Mon horaire" description="Vos quarts prévus et vos congés, par jour, semaine ou mois." />
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !me ? (
        <EmptyState
          icon={CalendarRange}
          title="Aucune fiche d'employé"
          description="Votre compte n'est lié à aucune fiche d'employé. Demandez à votre employeur de vous y associer."
        />
      ) : (
        <PlanningCalendar employeeId={me.id} canEdit={false} />
      )}
    </div>
  );
}
