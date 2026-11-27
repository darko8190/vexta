"use client";

import { CalendarRange } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { ScheduleSection } from "@/components/hr/employee/schedule-section";
import { useMyEmployeeQuery } from "@/hooks/use-my-employee";

/** The employee's own week: where they are expected, and when. Read only. */
export default function MySchedulePage() {
  const { data: me, isLoading } = useMyEmployeeQuery();
  return (
    <div className="max-w-5xl">
      <PageHeader title="Mon horaire" description="Vos quarts prévus, semaine par semaine." />
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !me ? (
        <EmptyState
          icon={CalendarRange}
          title="Aucune fiche d'employé"
          description="Votre compte n'est lié à aucune fiche d'employé. Demandez à votre employeur de vous y associer."
        />
      ) : (
        <ScheduleSection employeeId={me.id} canEdit={false} />
      )}
    </div>
  );
}
