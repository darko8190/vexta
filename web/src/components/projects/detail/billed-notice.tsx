"use client";

import { Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { storedValues } from "@/components/projects/project-form-sheet";
import { useProjectQuery, useUpdateProject } from "@/hooks/use-projects";
import { useCanManage } from "@/hooks/use-can-create";
import { ApiError } from "@/lib/api";

/**
 * Why a billed project's figures cannot be touched, with the way out: unlocking moves the
 * project back to « Commencé », and the sections can be edited again.
 *
 * One component for every section that freezes, and for the banner at the top of the project.
 */
export function BilledNotice({ projectId, className = "mb-4" }: { projectId: string; className?: string }) {
  const { data: project } = useProjectQuery(projectId);
  const update = useUpdateProject();
  const canManage = useCanManage();

  async function unlock() {
    if (!project) return;
    try {
      await update.mutateAsync({ id: project.id, values: { ...storedValues(project), status: "Commence" } });
      toast.success("Projet débloqué. Ses éléments peuvent être modifiés.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de débloquer le projet.");
    }
  }

  return (
    <Alert className={className}>
      <Lock />
      <AlertTitle>Projet facturé</AlertTitle>
      <AlertDescription>
        <p>
          Une facture a été générée pour ce projet : ses éléments sont figés pour rester conformes à
          la facture. Débloquez le projet pour les modifier.
        </p>
        {canManage && project && (
          <Button size="sm" variant="outline" className="mt-2" onClick={() => void unlock()} disabled={update.isPending}>
            {update.isPending ? <Spinner /> : <LockOpen />}
            Débloquer le projet
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
