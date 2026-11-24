"use client";

import Link from "next/link";
import { Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { useMyApplicationsQuery } from "@/hooks/use-personal-profile";
import { candidateStatusLabels } from "@/lib/labels";
import { formatDateOnly } from "@/lib/dates";

/**
 * What this person has applied to.
 *
 * Shows where each one stands, because that is the question somebody actually has after
 * applying, and the company is already keeping the answer on its own card. It shows nothing
 * else from that card: the company's notes on them are the company's.
 */
export function MyApplicationsSection() {
  const { data, isLoading, isError, error, refetch } = useMyApplicationsQuery();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-2 py-6">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-5 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (isError) return <LoadErrorState error={error} onRetry={() => void refetch()} />;

  const applications = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mes candidatures</CardTitle>
        <CardDescription>Les offres auxquelles vous avez répondu sur Vexta.</CardDescription>
      </CardHeader>

      <CardContent>
        {applications.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="Aucune candidature"
            description="Les offres se trouvent sur la page publique des entreprises."
          />
        ) : (
          <ul className="grid gap-2">
            {applications.map((application) => (
              <li
                key={application.candidateId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{application.jobTitle}</p>
                  <p className="text-sm text-muted-foreground">
                    {application.companySlug ? (
                      <Link href={`/e/${application.companySlug}`} className="hover:underline">
                        {application.companyName}
                      </Link>
                    ) : (
                      application.companyName
                    )}
                    {" · "}
                    {formatDateOnly(application.appliedOn)}
                  </p>
                </div>
                <Badge variant="outline">{candidateStatusLabels[application.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
