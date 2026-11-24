"use client";

import { useState } from "react";
import Link from "next/link";
import { Briefcase, MapPin, Search, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { useDirectoryJobsQuery } from "@/hooks/use-directory";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { employmentTypeLabels } from "@/lib/labels";
import { formatDateOnly } from "@/lib/dates";
import type { EmploymentType } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The categories, in the order a job board reads them: full time first. */
const TYPES: EmploymentType[] = ["TempsPlein", "TempsPartiel", "Contrat", "Saisonnier", "Stage"];

/**
 * Every position advertised across Vexta.
 *
 * Pattern: List / Index. One job on this URL — find work — so a search box, the kind of
 * contract as the one filter, and a list. Nothing is sorted by company: somebody looking for
 * work is looking for the work, and the employer is a detail of the posting.
 *
 * A posting is only here while its company's page is published and showing jobs. That is the
 * same gate the company's own page applies, so a filled position taken off one is off both.
 */
export default function JobBoardPage() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<EmploymentType | "">("");
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search, 300);

  const { data, isLoading, isError, error, refetch } = useDirectoryJobsQuery(debounced, type, page);

  const jobs = data?.items ?? [];

  function choose(next: EmploymentType | "") {
    setType(next);
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Rechercher un emploi"
        description="Les offres publiées par les entreprises de Vexta."
      />

      <div className="mb-4 space-y-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Métier, ville, entreprise…"
            aria-label="Rechercher une offre d'emploi"
            className="pl-9"
          />
        </div>

        {/* Buttons rather than a dropdown: five choices that fit on one line are five choices
            somebody can compare without opening anything. */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Type d'emploi">
          <Button
            type="button"
            size="sm"
            variant={type === "" ? "default" : "outline"}
            onClick={() => choose("")}
          >
            Tous
          </Button>
          {TYPES.map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={type === item ? "default" : "outline"}
              onClick={() => choose(item)}
            >
              {employmentTypeLabels[item]}
            </Button>
          ))}
        </div>
      </div>

      {isLoading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState error={error} onRetry={() => void refetch()} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={debounced || type ? "Aucune offre ne correspond" : "Aucune offre pour le moment"}
          description={
            debounced || type
              ? "Essayez un autre mot, ou retirez le filtre."
              : "Les entreprises qui publient une offre sur leur page apparaîtront ici."
          }
        />
      ) : (
        <>
          <ul className="grid gap-2">
            {jobs.map((job) => (
              <li
                key={job.id}
                className={cn(
                  "rounded-lg border border-border bg-card p-4",
                  "transition-colors hover:bg-muted/40",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-medium text-foreground">{job.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      <Link href={`/e/${job.companySlug}`} className="hover:underline">
                        {job.companyName}
                      </Link>
                      {job.postedOn && ` · ${formatDateOnly(job.postedOn)}`}
                    </p>
                  </div>
                  <Badge variant="secondary">{employmentTypeLabels[job.employmentType]}</Badge>
                </div>

                {job.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {job.description}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  {job.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="size-4" />
                      {job.location}
                    </span>
                  )}
                  {job.compensation && (
                    <span className="flex items-center gap-1.5">
                      <Wallet className="size-4" />
                      {job.compensation}
                    </span>
                  )}

                  {/* Applying happens on the company's page, where the Postuler button and the
                      posting's own questions already live. A second way in here would be a
                      second place to keep that flow correct. */}
                  <Link
                    href={`/e/${job.companySlug}`}
                    className="ml-auto font-medium text-primary hover:underline"
                  >
                    Voir l&apos;offre
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          <PaginationBar result={data} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
