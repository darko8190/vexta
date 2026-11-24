import type {
  AccountEntryKind,
  AddressType,
  CandidateStatus,
  ClientStatus,
  CredentialKind,
  CvEntryKind,
  EmploymentType,
  CustomerOrderStatus,
  FormActionKind,
  FormFieldTarget,
  FormKind,
  PublicPageSectionKind,
  FormFieldType,
  InvoiceLineKind,
  InvoiceStatus,
  JobPostingStatus,
  LeaveKind,
  LeaveStatus,
  MarginMode,
  PaymentMethod,
  PurchaseOrderStatus,
  WageKind,
  ProjectStatus,
  ProjectTaskPriority,
  ProjectTaskStatus,
  TenantSubscriptionStatus,
  UserRole,
} from "@/lib/types";

/**
 * The enum name is what travels; these are the words on screen. "Chargé de projet" is what the
 * office calls the person, and ProjectManager is what the token says — neither is translatable
 * into the other without this table.
 */
export const userRoleLabels: Record<UserRole, string> = {
  SuperAdmin: "Super admin",
  TenantAdmin: "Administrateur",
  ProjectManager: "Chargé de projet",
  TenantUser: "Employé",
  Client: "Client",
};

/** What each role may do, said in one line under the choice. */
export const userRoleHints: Record<"TenantAdmin" | "ProjectManager" | "TenantUser", string> = {
  TenantAdmin: "Tout, y compris les employés, la fiche entreprise et le forfait.",
  ProjectManager: "Les clients, les projets, l'inventaire et les factures. Pas les employés ni les paramètres.",
  TenantUser: "Consulte les dossiers, et saisit son temps, ses dépenses et ses tâches.",
};

/**
 * Where a client stands with the company.
 *
 * "Banni" is not here, because it is not one of these: it is the lock on the record, and a
 * barred client keeps whichever of the three they were. The badge on the screen shows the lock
 * instead when it is closed — see clientStatusBadge.
 */
export const clientStatusLabels: Record<ClientStatus, string> = {
  Prospect: "Prospect",
  Client: "Client",
  Ancien: "Ancien client",
};

/**
 * What the card shows: the lock when it is closed, the status otherwise.
 *
 * One function rather than two badges, because the two cannot both be true on screen without
 * somebody having to work out which one wins. Barred wins.
 */
export function clientStatusBadge(client: { status: ClientStatus; isBlocked: boolean }): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (client.isBlocked) return { label: "Banni", variant: "destructive" };

  return client.status === "Prospect"
    ? { label: "Prospect", variant: "default" }
    : client.status === "Ancien"
      ? { label: "Ancien client", variant: "outline" }
      : { label: "Client", variant: "secondary" };
}

/** What a form question accepts. The words a person building a form would use. */
export const formFieldTypeLabels: Record<FormFieldType, string> = {
  Texte: "Texte",
  TexteLong: "Paragraphe",
  Nombre: "Nombre",
  Date: "Date",
  Choix: "Choix",
  MultiChoix: "Choix multiples",
  OuiNon: "Oui / Non",
  Courriel: "Courriel",
  Telephone: "Téléphone",
  Fichier: "Fichier / image",
};

/** The line under each type in the list, so nobody has to try one to find out. */
export const formFieldTypeHints: Record<FormFieldType, string> = {
  Texte: "Une ligne.",
  TexteLong: "Plusieurs lignes.",
  Nombre: "Chiffres seulement.",
  Date: "Un calendrier.",
  Choix: "Une seule réponse parmi celles que vous offrez.",
  MultiChoix: "Autant de réponses que voulu parmi celles que vous offrez.",
  OuiNon: "Une case à cocher.",
  Courriel: "Une adresse courriel.",
  Telephone: "Un numéro de téléphone.",
  Fichier: "Un fichier ou une image à téléverser.",
};

/** What a form is about. The order is the order they are offered in. */
export const formKindLabels: Record<FormKind, string> = {
  Defaut: "Formulaire",
  Actif: "Actif d'un client",
  Client: "Nouveau client",
  Soumission: "Demande de soumission",
};

/** The line under the choice: what picking this kind is for. */
export const formKindHints: Record<FormKind, string> = {
  Defaut: "Des questions, conservées et envoyées au bureau. Une inspection, une feuille de chantier.",
  Actif: "Au sujet de quelque chose qu'un client possède : un véhicule à l'atelier, un immeuble à inspecter.",
  Client: "Fait entrer quelqu'un : un formulaire de contact, une fiche de nouveau client.",
  Soumission:
    "Une demande de prix. Les réponses arrivent dans Réponses et le bureau les chiffre — Vexta n'a pas encore de soumissions.",
};

/**
 * Which field of a client, or of one of its assets, an answer fills.
 *
 * Each one names the record it fills, because the list is read in a dropdown with no headings
 * above it: « Marque » alone leaves somebody wondering marque de quoi.
 */
export const formFieldTargetLabels: Record<FormFieldTarget, string> = {
  Aucun: "Aucun",
  Prenom: "Client — prénom",
  Nom: "Client — nom",
  NomEntreprise: "Client — nom de l'entreprise",
  Courriel: "Client — courriel",
  Telephone: "Client — téléphone",
  Notes: "Client — notes",
  ActifLibelle: "Actif — libellé",
  ActifMarque: "Actif — marque",
  ActifModele: "Actif — modèle",
  ActifAnnee: "Actif — année",
  ActifNumeroSerie: "Actif — numéro de série ou NIV",
  ActifReference: "Actif — plaque ou référence",
  ActifUsage: "Actif — usage (km, heures)",
  ActifNotes: "Actif — notes",
};

/**
 * Where an order stands, in the words a counter would use.
 *
 * The same five words on both sides: the company moves the order along, and the customer reads
 * exactly what the company said. A screen that translated them would be two vocabularies for
 * one fact, and the telephone call that follows would be about the translation.
 */
export const customerOrderStatusLabels: Record<CustomerOrderStatus, string> = {
  Recue: "Reçue",
  EnPreparation: "En préparation",
  Prete: "Prête",
  Livree: "Livrée",
  Annulee: "Annulée",
};

export const customerOrderStatusBadgeVariant: Record<
  CustomerOrderStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  Recue: "default",
  EnPreparation: "secondary",
  Prete: "secondary",
  Livree: "outline",
  Annulee: "destructive",
};

/** What a band of the public page holds, in the words of somebody arranging one. */
export const pageSectionKindLabels: Record<PublicPageSectionKind, string> = {
  Texte: "Texte",
  Galerie: "Galerie de photos",
  Produits: "Mes produits",
  Emplois: "Mes offres d'emploi",
  Formulaires: "Mes formulaires",
  Image: "Une photo pleine largeur",
};

/** The line under the choice: what placing this band actually does. */
export const pageSectionKindHints: Record<PublicPageSectionKind, string> = {
  Texte: "Un titre et des paragraphes. Celui qui porte tout ce que les autres ne portent pas.",
  Galerie: "Une de vos galeries, en grille. Le nombre de colonnes dit combien de photos par rangée.",
  Produits: "Les produits cochés comme publics, avec leur prix et le panier s'il est activé.",
  Emplois: "Les offres publiées, avec le bouton Postuler.",
  Formulaires: "Les formulaires cochés « sur la page publique ».",
  Image: "Une seule photo, sur toute la largeur. Un chantier, une équipe, une toiture finie.",
};

export const formActionKindLabels: Record<FormActionKind, string> = {
  EnvoyerCourriel: "Envoyer les réponses par courriel",
  CreerClient: "Créer un client",
  CreerActifClient: "Créer un actif de client",
};

export const addressTypeLabels: Record<AddressType, string> = {
  Facturation: "Facturation",
  Livraison: "Livraison",
  SiegeSocial: "Siège social",
  Autre: "Autre",
};

export const projectStatusLabels: Record<ProjectStatus, string> = {
  AFaire: "À faire",
  Commence: "Commencé",
  AFacturer: "À facturer",
  Facture: "Facturé",
  Annule: "Annulé",
};

export const taskStatusLabels: Record<ProjectTaskStatus, string> = {
  AFaire: "À faire",
  EnCours: "En cours",
  Bloquee: "Bloquée",
  Terminee: "Terminée",
};

/**
 * Bloquée is the one that stands out. A task waiting on a part is nobody's fault and will not
 * move on its own, which is exactly what has to be noticed in a list.
 */
export const taskStatusBadgeVariant: Record<ProjectTaskStatus, "default" | "secondary" | "destructive" | "outline"> = {
  AFaire: "outline",
  EnCours: "default",
  Bloquee: "destructive",
  Terminee: "secondary",
};

export const taskPriorityLabels: Record<ProjectTaskPriority, string> = {
  Basse: "Basse",
  Normale: "Normale",
  Haute: "Haute",
  Urgente: "Urgente",
};

/**
 * "Porté au compte" is the one that is not really a payment: the invoice is settled and the
 * client owes the money on their account instead. The wording says so rather than leaving
 * somebody to work out why the till does not balance.
 */
export const paymentMethodLabels: Record<PaymentMethod, string> = {
  Comptant: "Comptant",
  Interac: "Interac",
  Carte: "Carte",
  Cheque: "Chèque",
  Virement: "Virement",
  PorteAuCompte: "Porté au compte",
  Autre: "Autre",
};

export const accountEntryKindLabels: Record<AccountEntryKind, string> = {
  Charge: "Charge",
  Paiement: "Paiement",
  Ajustement: "Ajustement",
};

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  Brouillon: "Brouillon",
  Envoyee: "Envoyée",
  Payee: "Payée",
  EnRetard: "En retard",
  Annulee: "Annulée",
};

export const tenantStatusLabels: Record<TenantSubscriptionStatus, string> = {
  Incomplete: "Incomplet",
  Active: "Actif",
  PastDue: "Paiement en retard",
  Canceled: "Annulé",
  Trialing: "Essai gratuit",
};

export const projectStatusBadgeVariant: Record<ProjectStatus, "default" | "secondary" | "destructive" | "outline"> = {
  AFaire: "outline",
  Commence: "default",
  // À facturer is the one that needs chasing, so it is the one that stands out.
  AFacturer: "default",
  Facture: "secondary",
  Annule: "destructive",
};

export const invoiceStatusBadgeVariant: Record<InvoiceStatus, "default" | "secondary" | "destructive" | "outline"> = {
  Brouillon: "outline",
  Envoyee: "secondary",
  Payee: "default",
  EnRetard: "destructive",
  Annulee: "destructive",
};

export const tenantStatusBadgeVariant: Record<TenantSubscriptionStatus, "default" | "secondary" | "destructive" | "outline"> = {
  Incomplete: "outline",
  Active: "default",
  PastDue: "destructive",
  Canceled: "destructive",
  // Not "default": a trial is working but temporary, and a badge that reads the same as a paid
  // subscription hides the one fact about it that matters.
  Trialing: "secondary",
};

export const invoiceLineKindLabels: Record<InvoiceLineKind, string> = {
  Materiaux: "Matériaux",
  MainDOeuvre: "Main-d'œuvre",
  Equipement: "Équipement",
  FraisSupplementaires: "Frais supplémentaires",
  Autre: "Autre",
};

export const marginModeLabels: Record<MarginMode, string> = {
  Multiplication: "Multiplication",
  Division: "Division",
};

export const jobPostingStatusLabels: Record<JobPostingStatus, string> = {
  Brouillon: "Brouillon",
  Publiee: "Publiée",
  Pourvue: "Pourvue",
  Fermee: "Fermée",
};

/**
 * Pourvue is not a success colour and not a warning: a filled position is simply closed, and
 * the only one worth drawing attention to is the one that is out and collecting applications.
 */
export const jobPostingStatusBadgeVariant: Record<JobPostingStatus, "default" | "secondary" | "outline"> = {
  Brouillon: "outline",
  Publiee: "default",
  Pourvue: "secondary",
  Fermee: "secondary",
};

export const employmentTypeLabels: Record<EmploymentType, string> = {
  TempsPlein: "Temps plein",
  TempsPartiel: "Temps partiel",
  Contrat: "Contrat",
  Saisonnier: "Saisonnier",
  Stage: "Stage",
};

// ---- La fiche de l'employé ----

export const wageKindLabels: Record<WageKind, string> = {
  Horaire: "Taux horaire",
  Annuel: "Salaire annuel",
};

export const leaveKindLabels: Record<LeaveKind, string> = {
  Vacances: "Vacances",
  Maladie: "Maladie",
  SansSolde: "Sans solde",
  Parental: "Parental",
  BanqueHeures: "Banque d'heures",
  Autre: "Autre",
};

export const leaveStatusLabels: Record<LeaveStatus, string> = {
  EnAttente: "En attente",
  Approuve: "Approuvé",
  Refuse: "Refusé",
  Annule: "Annulé",
};

export const leaveStatusBadgeVariant: Record<LeaveStatus, "default" | "secondary" | "destructive" | "outline"> = {
  EnAttente: "outline",
  Approuve: "default",
  Refuse: "destructive",
  Annule: "secondary",
};

export const credentialKindLabels: Record<CredentialKind, string> = {
  Formation: "Formation",
  Permis: "Permis",
  Carte: "Carte de compétence",
};

export const cvEntryKindLabels: Record<CvEntryKind, string> = {
  Experience: "Expérience",
  Formation: "Formation",
  Competence: "Compétence",
};

export const candidateStatusLabels: Record<CandidateStatus, string> = {
  Nouveau: "Nouveau",
  Entrevue: "Entrevue",
  Offre: "Offre",
  Embauche: "Embauché",
  Refuse: "Refusé",
  Retire: "Retiré",
};

export const candidateStatusBadgeVariant: Record<CandidateStatus, "default" | "secondary" | "destructive" | "outline"> = {
  Nouveau: "outline",
  Entrevue: "secondary",
  Offre: "secondary",
  Embauche: "default",
  Refuse: "destructive",
  Retire: "secondary",
};

/**
 * How long is left on a card, said in words rather than in days.
 *
 * Expired and "expires this week" are the two the department acts on, so they are the two that
 * read differently at a glance. Everything beyond a month is simply a date.
 */
export function credentialExpiryLabel(daysUntilExpiry: number | null): {
  text: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (daysUntilExpiry === null) return { text: "N'expire pas", variant: "secondary" };
  if (daysUntilExpiry < 0) {
    const days = Math.abs(daysUntilExpiry);
    return { text: days === 1 ? "Expirée hier" : `Expirée depuis ${days} jours`, variant: "destructive" };
  }
  if (daysUntilExpiry === 0) return { text: "Expire aujourd'hui", variant: "destructive" };
  if (daysUntilExpiry <= 30) {
    return {
      text: daysUntilExpiry === 1 ? "Expire demain" : `Expire dans ${daysUntilExpiry} jours`,
      variant: "outline",
    };
  }
  return { text: `Expire dans ${Math.round(daysUntilExpiry / 30)} mois`, variant: "secondary" };
}

// ---- Fournisseurs et commandes ----

export const purchaseOrderStatusLabels: Record<PurchaseOrderStatus, string> = {
  Brouillon: "Brouillon",
  Envoyee: "Envoyée",
  PartiellementRecue: "Partiellement reçue",
  Recue: "Reçue",
  Annulee: "Annulée",
};

export const purchaseOrderStatusBadgeVariant: Record<PurchaseOrderStatus, "default" | "secondary" | "destructive" | "outline"> = {
  Brouillon: "outline",
  Envoyee: "secondary",
  PartiellementRecue: "secondary",
  Recue: "default",
  Annulee: "destructive",
};
