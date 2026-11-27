"use client";

import { CalendarDays } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { LeavesSection } from "@/components/hr/employee/leaves-section";
import { useMyEmployeeQuery } from "@/hooks/use-my-employee";

/** The employee's own leave: what they asked for, what was answered, and a new request. */
export default function MyLeavesPage() {
  const { data: me, isLoading } = useMyEmployeeQuery();
  return (
    <div className="max-w-4xl">
      <PageHeader title="Mes demandes de congés" description="Vos vacances, congés et absences, et ce qui a été répondu." />
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !me ? (
        <NoEmployeeFile icon={CalendarDays} />
      ) : (
        <LeavesSection employeeId={me.id} canDecide={false} />
      )}
    </div>
  );
}

function NoEmployeeFile({ icon }: { icon: typeof CalendarDays }) {
  return (
    <EmptyState
      icon={icon}
      title="Aucune fiche d'employé"
      description="Votre compte n'est lié à aucune fiche d'employé. Demandez à votre employeur de vous y associer."
    />
  );
}
