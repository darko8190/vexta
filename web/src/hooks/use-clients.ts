import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";
import type {
  ClientAddress,
  ClientContact,
  ClientRecord,
  ClientStatus,
  ClientSummary,
  ClientType,
  InvitationGrant,
  PagedResult,
} from "@/lib/types";

export interface ClientFormValues {
  type: ClientType;
  companyName: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  taxId?: string | null;
  notes?: string | null;
  /** No tax charged to this client. Their projects and invoices start from this. */
  isTaxExempt: boolean;
  /** Prospect, client or ancien client. Never "Banni" — that is the lock on the record. */
  status: ClientStatus;
  primaryAddress: Omit<ClientAddress, "id"> | null;
  /** The contact the invoices go to first. Null falls back to the client's own person. */
  billingContactId?: string | null;
}

/**
 * The client exactly as stored, in the save endpoint's shape — what the form would send if
 * nothing were touched. A table that edits one cell patches this and sends the rest unchanged.
 */
export function storedClientValues(client: ClientRecord): ClientFormValues {
  const address = client.primaryAddress;
  return {
    type: client.type,
    companyName: client.type === "Entreprise" ? client.companyName : null,
    firstName: client.firstName ?? "",
    lastName: client.lastName ?? "",
    email: client.email,
    phone: client.phone,
    isTaxExempt: client.isTaxExempt,
    status: client.status,
    billingContactId: client.billingContactId,
    primaryAddress: address
      ? {
          line1: address.line1,
          apartment: address.apartment,
          city: address.city,
          province: address.province,
          postalCode: address.postalCode,
          country: address.country,
        }
      : null,
  };
}

export interface ClientContactFormValues {
  firstName: string;
  lastName: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

/**
 * The client list.
 *
 * <paramref name="statut"/> is one of the three states, or "Bloques" — which is not a state but
 * the lock, and is asked for separately because it can be closed on a client of any state.
 */
export function useClientsQuery(
  page: number,
  search: string,
  statut?: ClientStatus | "Bloques",
  /** Column filters, already as query parameters (see filtersToQuery). */
  filters: Record<string, string> = {},
) {
  const filter =
    statut === "Bloques" ? { bloques: true } : statut ? { statut } : {};

  return useQuery({
    queryKey: ["clients", page, search, statut ?? "tous", filters],
    queryFn: () =>
      api.get<PagedResult<ClientRecord>>(`clients${buildQuery({ page, search, ...filter, ...filters })}`),
    placeholderData: (previous) => previous,
  });
}

/** Undefined is "nothing to fetch", which is what the forms pass before a client is chosen. */
export function useClientQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["clients", "detail", id],
    queryFn: () => api.get<ClientRecord>(`clients/${id}`),
    enabled: Boolean(id),
  });
}

export function useClientSummaryQuery(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["clients", "summary"],
    queryFn: () => api.get<ClientSummary[]>("clients/summary"),
    staleTime: 60_000,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ClientFormValues) => api.post<ClientRecord>("clients", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: ClientFormValues }) =>
      api.put<ClientRecord>(`clients/${id}`, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`clients/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });
}

// ---- Contacts attached to a client ----

export function useClientContactsQuery(clientId: string) {
  return useQuery({
    queryKey: ["clients", "contacts", clientId],
    queryFn: () => api.get<ClientContact[]>(`clients/${clientId}/contacts`),
    enabled: Boolean(clientId),
  });
}

/**
 * The roles the company's contacts already have, plus the usual ones, to fill the role
 * dropdown. The usual ones are offered so the first contact of a new company is not typed from
 * nothing; anything the company types joins the list from then on.
 */
const COMMON_ROLES = ["Achats", "Comptabilité", "Contremaître", "Gérant de projet", "Propriétaire"];

export function useContactRolesQuery() {
  return useQuery({
    queryKey: ["clients", "contact-roles"],
    queryFn: async () => {
      const used = await api.get<string[]>("clients/contact-roles");
      const seen = new Set(used.map((role) => role.toLocaleLowerCase("fr-CA")));
      return [...used, ...COMMON_ROLES.filter((role) => !seen.has(role.toLocaleLowerCase("fr-CA")))];
    },
    staleTime: 60_000,
  });
}

export function useSaveClientContact(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: ClientContactFormValues }) =>
      id
        ? api.put<ClientContact>(`clients/${clientId}/contacts/${id}`, values)
        : api.post<ClientContact>(`clients/${clientId}/contacts`, values),
    // The client record carries the contact count, so both have to be refreshed.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useDeleteClientContact(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`clients/${clientId}/contacts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });
}

// ---- Portal access, for a particulier or for one contact at a company ----

/**
 * One hook for both, because the only difference is the path: a particulier is invited on their
 * own record, a contact on theirs. Pass contactId for the second.
 */
export function useClientAccess(clientId: string) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["clients"] });

  const base = (contactId?: string) =>
    contactId ? `clients/${clientId}/contacts/${contactId}/acces` : `clients/${clientId}/acces`;

  const grant = useMutation({
    mutationFn: (contactId?: string) => api.post<InvitationGrant>(base(contactId)),
    onSuccess: refresh,
  });

  const resend = useMutation({
    mutationFn: (contactId?: string) => api.post<InvitationGrant>(`${base(contactId)}/renvoyer`),
    onSuccess: refresh,
  });

  const revoke = useMutation({
    mutationFn: (contactId?: string) => api.delete(base(contactId)),
    onSuccess: refresh,
  });

  return { grant, resend, revoke };
}
