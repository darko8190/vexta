"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeDollarSign,
  CalendarClock,
  CalendarRange,
  FileText,
  FileUser,
  Gift,
  GraduationCap,
  Home,
  Hourglass,
  IdCard,
  LifeBuoy,
  Mail,
  Palmtree,
  Pencil,
  Phone,
  Receipt,
  Send,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { userRoleLabels } from "@/lib/labels";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { SectionPlaceholder } from "@/components/projects/detail/section-placeholder";
import { CredentialsSection } from "@/components/hr/credentials-section";
import { DocumentsSection } from "@/components/hr/documents-section";
import { EmergencyContactsSection } from "@/components/hr/emergency-contacts-section";
import { EmployeeAddressesSection } from "@/components/hr/employee-addresses-section";
import { CvSection } from "@/components/hr/employee/cv-section";
import { EmployeeTimesheetsSection } from "@/components/hr/employee/employee-timesheets-section";
import { HourBankSection } from "@/components/hr/employee/hour-bank-section";
import { LeavesSection } from "@/components/hr/employee/leaves-section";
import { ScheduleSection } from "@/components/hr/employee/schedule-section";
import { WagesSection } from "@/components/hr/employee/wages-section";
import { EmployeeFormSheet } from "@/components/team/employee-form-sheet";
import { InvitationLinkDialog } from "@/components/team/invitation-link-dialog";
import { useEmployeeFileCountsQuery } from "@/hooks/use-employee-file";
import { useIsOwner } from "@/hooks/use-can-create";
import {
  useEmployeeQuery,
  useGrantAccess,
  useResendInvitation,
  useRevokeAccess,
} from "@/hooks/use-team";
import { ApiError } from "@/lib/api";
import type { AccessGranted } from "@/lib/types";
import { cn } from "@/lib/utils";

function message(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * One employee's file. Reached by pressing their row, like every other record.
 *
 * The owner of the company appears here like anyone else, with one difference the page states
 * rather than hides: their access is not something that can be taken away, because it is the
 * account the space belongs to.
 */
export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, isError } = useEmployeeQuery(id);
  const { data: counts } = useEmployeeFileCountsQuery(id);
  const isOwner = useIsOwner();
  const grantAccess = useGrantAccess();
  const revokeAccess = useRevokeAccess();
  const resendInvitation = useResendInvitation();

  const [editOpen, setEditOpen] = useState(false);
  const [grant, setGrant] = useState<AccessGranted | null>(null);

  // Always Détails, and not remembered between visits: the file is opened to look somebody up,
  // and landing on last week's section means reading the page before you can use it.
  const [section, setSection] = useState("details");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <EmptyState
        icon={UsersRound}
        title="Employé introuvable"
        description="Cette fiche n'existe plus, ou vous n'y avez pas accès."
        action={
          <Link href="/ressources-humaines" className={cn(buttonVariants())}>
            Retour aux ressources humaines
          </Link>
        }
      />
    );
  }

  const { employee, teams } = data;
  const busy = grantAccess.isPending || revokeAccess.isPending || resendInvitation.isPending;

  // Thirteen sections, and six of them say plainly that they hold nothing yet rather than
  // being hidden. The rail is the plan: somebody looking at a file can see what will be kept
  // on it, and a badge at zero is honest about there being nothing there today.
  const sections: NavSection[] = [
    { key: "details", label: "Détails", icon: IdCard },
    { key: "contacts", label: "Contacts", count: counts?.emergencyContacts, icon: LifeBuoy },
    { key: "adresses", label: "Adresses", count: counts?.addresses, icon: Home },
    { key: "cv", label: "CV", count: counts?.cvEntries, icon: FileUser },
    { key: "salaires", label: "Salaires", count: counts?.wages, icon: BadgeDollarSign },
    { key: "depenses", label: "Dépenses", count: 0, icon: Receipt },
    { key: "formations", label: "Formations/Permis", count: counts?.credentials, icon: GraduationCap },
    { key: "horaire", label: "Horaire", icon: CalendarRange },
    { key: "conges", label: "Demandes de congés", count: counts?.pendingLeaves, icon: Palmtree },
    { key: "feuilles-de-temps", label: "Feuilles de temps", icon: CalendarClock },
    { key: "banque-heures", label: "Banque d'heures", count: counts?.hourBankEntries, icon: Hourglass },
    { key: "avantages", label: "Avantages et allocations", count: 0, icon: Gift },
    { key: "documents", label: "Documents/Notes", count: counts?.documents, icon: FileText },
  ];

  async function onGrant() {
    try {
      const result = await grantAccess.mutateAsync(id);
      if (!result.invitationUrl) {
        toast.success("Cette personne avait déjà un compte Vexta. L'entreprise apparaîtra dans ses espaces.");
        return;
      }
      setGrant(result);
    } catch (error) {
      toast.error(message(error, "Impossible de créer cet accès."));
    }
  }

  async function onRevoke() {
    try {
      await revokeAccess.mutateAsync(id);
      toast.success("Accès retiré. La fiche reste au dossier.");
    } catch (error) {
      toast.error(message(error, "Impossible de retirer cet accès."));
    }
  }

  async function onResend() {
    try {
      setGrant(await resendInvitation.mutateAsync(id));
    } catch (error) {
      toast.error(message(error, "Impossible de renvoyer l'invitation."));
    }
  }

  return (
    <div>
      <Link
        href="/ressources-humaines"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Ressources humaines
      </Link>

      <div className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {employee.isOwner && (
                <Badge variant="default">
                  <ShieldCheck />
                  Propriétaire
                </Badge>
              )}
              {!employee.hasAccess ? (
                <Badge variant="secondary">Au dossier</Badge>
              ) : employee.invitationExpired ? (
                <Badge variant="destructive">Invitation expirée</Badge>
              ) : employee.invitationPending ? (
                <Badge variant="outline">Invitation envoyée</Badge>
              ) : (
                <Badge variant="default">Accès actif</Badge>
              )}
              {/* Shown beside the state of their access, because the two answer the same
                  question together: can this person get in, and what can they do once in. */}
              <Badge variant={employee.role === "TenantUser" ? "outline" : "secondary"}>
                {userRoleLabels[employee.role]}
              </Badge>
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {employee.firstName} {employee.lastName}
            </h1>
            {employee.jobTitle && <p className="mt-0.5 text-sm text-muted-foreground">{employee.jobTitle}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {employee.invitationPending && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={onResend}>
                <Send />
                Renvoyer l&apos;invitation
              </Button>
            )}
            {!employee.isOwner &&
              (employee.hasAccess ? (
                <Button variant="ghost" size="sm" disabled={busy} onClick={onRevoke}>
                  Retirer l&apos;accès
                </Button>
              ) : (
                <Button variant="ghost" size="sm" disabled={busy} onClick={onGrant}>
                  Donner l&apos;accès
                </Button>
              ))}
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil />
              Modifier
            </Button>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Courriel</dt>
            <dd className="truncate">
              <a
                href={`mailto:${employee.email}`}
                className="inline-flex max-w-full items-center gap-1.5 text-foreground hover:underline"
              >
                <Mail className="size-3.5 shrink-0" />
                <span className="truncate">{employee.email}</span>
              </a>
            </dd>
          </div>
          {employee.phone && (
            <div>
              <dt className="text-muted-foreground">Téléphone</dt>
              <dd>
                <a
                  href={`tel:${employee.phone}`}
                  className="inline-flex items-center gap-1.5 text-foreground hover:underline"
                >
                  <Phone className="size-3.5 shrink-0" />
                  {employee.phone}
                </a>
              </dd>
            </div>
          )}
        </dl>

        {employee.isOwner && (
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            C&apos;est le compte auquel l&apos;espace appartient : son accès ne peut pas être
            retiré et sa fiche ne peut pas être supprimée.
          </p>
        )}
      </div>

      {/* The rail sits beside the content from md up and becomes a scrollable row below it,
          the same shape as a client's file. */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav
          sections={sections}
          active={section}
          onSelect={setSection}
          label="Sections du dossier de l'employé"
        />

        <div className="min-w-0 flex-1">
          {section === "details" && (
            <div>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-foreground">Équipes</h2>
                <p className="text-sm text-muted-foreground">
                  Les équipes se composent depuis l&apos;onglet Équipes des ressources humaines.
                </p>
              </div>

              {teams.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Cette personne n&apos;est dans aucune équipe.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {teams.map((team) => (
                    <li key={team.id}>
                      <Badge variant={team.isLead ? "default" : "secondary"}>
                        {team.name}
                        {team.isLead && " · responsable"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {section === "contacts" && <EmergencyContactsSection employeeId={employee.id} />}
          {section === "adresses" && <EmployeeAddressesSection employeeId={employee.id} />}
          {section === "cv" && <CvSection employeeId={employee.id} />}

          {/* Behind the owner's role: a foreman who files hours has no business reading what
              the rest of the crew earns. */}
          {section === "salaires" &&
            (isOwner ? (
              <WagesSection employeeId={employee.id} />
            ) : (
              <SectionPlaceholder
                icon={BadgeDollarSign}
                title="Salaires"
                description="Seul un administrateur de l'entreprise voit les taux."
              />
            ))}

          {section === "depenses" && (
            <SectionPlaceholder
              icon={Receipt}
              title="Dépenses"
              description="Les dépenses remboursées à cette personne. Aujourd'hui, une dépense appartient au projet sur lequel elle a été faite."
            />
          )}

          {section === "formations" && <CredentialsSection employeeId={employee.id} />}
          {section === "horaire" && <ScheduleSection employeeId={employee.id} canEdit={isOwner} />}
          {section === "conges" && <LeavesSection employeeId={employee.id} canDecide={isOwner} />}
          {section === "feuilles-de-temps" && <EmployeeTimesheetsSection employeeId={employee.id} />}

          {section === "banque-heures" &&
            (isOwner ? (
              <HourBankSection employeeId={employee.id} />
            ) : (
              <SectionPlaceholder
                icon={Hourglass}
                title="Banque d'heures"
                description="Seul un administrateur de l'entreprise voit la banque d'heures."
              />
            ))}

          {section === "avantages" && (
            <SectionPlaceholder
              icon={Gift}
              title="Avantages et allocations"
              description="Assurance collective, REER, allocation de véhicule, outils fournis. Rien n'est encore suivi ici."
            />
          )}

          {section === "documents" && <DocumentsSection employeeId={employee.id} />}
        </div>
      </div>

      <EmployeeFormSheet open={editOpen} onOpenChange={setEditOpen} employee={employee} />

      <InvitationLinkDialog
        grant={grant}
        recipientName={grant?.employee.firstName}
        recipientEmail={grant?.employee.email}
        onOpenChange={(open) => !open && setGrant(null)}
      />
    </div>
  );
}
