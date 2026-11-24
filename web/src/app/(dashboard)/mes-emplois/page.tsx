"use client";

import { useState } from "react";
import Link from "next/link";
import { Briefcase, Clock, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { MyApplicationsSection } from "@/components/personal/my-applications-section";
import { useMyApplicationsQuery, useMyJobsQuery } from "@/hooks/use-personal-profile";
import { userRoleLabels } from "@/lib/labels";
import { formatDateOnly } from "@/lib/dates";

/**
 * Where this person works, and where they have asked to.
 *
 * Pattern: List / Index, with the two lists kept apart by the rail rather than stacked. They
 * answer different questions — "where am I" and "what am I waiting on" — and a screen that
 * answers both at once makes somebody read past the one they came for.
 */
export default function MyJobsPage() {
  const { data: applications } = useMyApplicationsQuery();
  const [section, setSection] = useState("emplois");

  const pending = (applications ?? []).filter(
    (application) => application.status !== "Embauche" && application.status !== "Refuse" && application.status !== "Retire",
  ).length;

  const sections: NavSection[] = [
    { key: "emplois", label: "Mes emplois", icon: Briefcase },
    { key: "candidatures", label: "Candidatures en attente", count: pending, icon: Clock },
  ];

  return (
    <div>
      <PageHeader
        title="Mes emplois"
        description="Où vous travaillez, et les offres auxquelles vous avez répondu."
      />

      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav
          sections={sections}
          active={section}
          onSelect={setSection}
          label="Sections de mes emplois"
        />

        <div className="min-w-0 flex-1">
          {section === "emplois" ? <JobsList /> : <MyApplicationsSection />}
        </div>
      </div>
    </div>
  );
}

function JobsList() {
  const { data, isLoading, isError, error, refetch } = useMyJobsQuery();

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (isError) return <LoadErrorState error={error} onRetry={() => void refetch()} />;

  const jobs = data ?? [];

  if (jobs.length === 0) {
    return (
      <Card>
        <CardContent className="py-6">
          <EmptyState
            icon={Briefcase}
            title="Aucun emploi"
            description="Une entreprise qui vous ajoute à son équipe apparaît ici. En attendant, les offres se trouvent dans Rechercher un emploi."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="grid gap-2">
      {jobs.map((job) => (
        <li
          key={job.employeeId}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
        >
          <div className="min-w-0">
            <p className="font-medium text-foreground">
              {job.companySlug ? (
                <Link href={`/e/${job.companySlug}`} className="hover:underline">
                  {job.companyName}
                  <ExternalLink className="ml-1 inline size-3.5 align-text-top text-muted-foreground" />
                </Link>
              ) : (
                job.companyName
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {job.jobTitle ?? "Poste non précisé"}
              {" · "}
              {/* "Ajouté le", not "depuis": Vexta records no hire date, and a word that
                  implies one would be making something up. */}
              ajouté le {formatDateOnly(job.addedOn)}
            </p>
          </div>
          <Badge variant="outline">{userRoleLabels[job.role]}</Badge>
        </li>
      ))}
    </ul>
  );
}
