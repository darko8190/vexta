"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteUserDialog } from "@/components/admin/delete-user-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { useAdminUsersQuery } from "@/hooks/use-admin-users";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const roleLabels: Record<string, string> = {
  SuperAdmin: "Super admin",
  TenantAdmin: "Fondateur",
  TenantUser: "Utilisateur",
  Client: "Client",
};

/**
 * Pattern 1 — List / Index. Every account on the platform, to find one and delete one.
 */
export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search, 300);
  const { data, isLoading, isError, error, refetch } = useAdminUsersQuery(page, debounced);

  return (
    <div>
      <PageHeader title="Utilisateurs" description="Tous les comptes de la plateforme." />

      <SearchInput
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Rechercher un nom ou un courriel…"
        className="mb-4 max-w-sm"
      />

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError && !data ? (
          <div className="p-4">
            <LoadErrorState error={error} onRetry={() => void refetch()} />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Users}
              title={debounced ? "Aucun compte ne correspond" : "Aucun compte"}
              description={debounced ? "Essayez un autre nom ou une autre adresse." : "Les comptes apparaissent ici à l'inscription."}
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Courriel</TableHead>
                <TableHead>Espace</TableHead>
                <TableHead className="text-center">Espaces</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {`${user.firstName} ${user.lastName}`.trim() || "—"}
                    <Badge variant="outline" className="ml-2">
                      {roleLabels[user.role] ?? user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    {user.homeName ?? "—"}
                    {user.homeKind && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {user.homeKind === "Personal" ? "personnel" : "entreprise"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{user.spaceCount}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString("fr-CA")}
                  </TableCell>
                  <TableCell className="text-right">
                    {user.role !== "SuperAdmin" && <DeleteUserDialog user={user} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="mt-4">
        <PaginationBar result={data} onPageChange={setPage} />
      </div>
    </div>
  );
}
