/**
 * The sub-tabs of each screen, for Paramètres › Menu to offer to hide.
 *
 * `screen` is the label the screen gives its SectionNav, which is how a hidden sub-tab is
 * recognised there. A new sub-tab on one of these screens goes here too, or it cannot be hidden.
 * « Détails » is left out on purpose: it is where a record opens.
 */
export interface SubTabScreen {
  screen: string;
  title: string;
  tabs: { key: string; label: string }[];
}

export const subTabScreens: SubTabScreen[] = [
  {
    screen: "Sections de la facturation",
    title: "Facturation",
    tabs: [
      { key: "factures", label: "Factures" },
      { key: "paiements", label: "Paiements" },
      { key: "credits", label: "Crédits" },
      { key: "remboursements", label: "Remboursements" },
      { key: "recurrentes", label: "Récurrentes" },
    ],
  },
  {
    screen: "Sections des achats",
    title: "Achats",
    tabs: [
      { key: "depenses", label: "Dépenses" },
      { key: "factures-fournisseurs", label: "Factures fournisseurs" },
    ],
  },
  {
    screen: "Sections des fournisseurs et commandes",
    title: "Fournisseurs & Commandes",
    tabs: [
      { key: "fournisseurs", label: "Fournisseurs" },
      { key: "commandes", label: "Commandes" },
      { key: "receptions", label: "Réceptions" },
      { key: "a-commander", label: "Produits à commander" },
    ],
  },
  {
    screen: "Sections de l'inventaire",
    title: "Inventaire",
    tabs: [
      { key: "produits", label: "Produits" },
      { key: "a-commander", label: "Produits à commander" },
      { key: "equipements", label: "Équipements" },
      { key: "entrepot", label: "Entrepôt" },
      { key: "assemblages", label: "Assemblages" },
      { key: "suivis", label: "Suivis d'inventaires" },
      { key: "historique-commandes", label: "Historique de commandes" },
      { key: "historique-receptions", label: "Historique de réceptions" },
    ],
  },
  {
    screen: "Sections du temps",
    title: "Feuilles de temps et poinçons",
    tabs: [
      { key: "journees", label: "Feuilles de temps de jour" },
      { key: "poincons", label: "Poinçons" },
    ],
  },
  {
    screen: "Sections à traiter",
    title: "À traiter",
    tabs: [
      { key: "commandes", label: "Commandes clients" },
      { key: "projets-a-assigner", label: "Projets à assigner" },
    ],
  },
  {
    screen: "Sections des tâches et de l'horaire",
    title: "Tâches et horaire",
    tabs: [
      { key: "horaire", label: "Horaire" },
      { key: "taches", label: "Tâches" },
    ],
  },
  {
    screen: "Sections des ressources humaines",
    title: "Ressources humaines",
    tabs: [
      { key: "employes", label: "Employés" },
      { key: "equipes", label: "Équipes" },
      { key: "adresses", label: "Adresses" },
      { key: "contacts", label: "Contacts" },
      { key: "offres-emplois", label: "Offres d'emplois" },
      { key: "candidats", label: "Candidats" },
      { key: "formations", label: "Formations" },
      { key: "conges", label: "Congés" },
      { key: "documents", label: "Documents" },
    ],
  },
  {
    screen: "Sections du client",
    title: "Fiche d'un client",
    tabs: [
      { key: "contacts", label: "Contacts" },
      { key: "actifs", label: "Actifs" },
      { key: "adresses", label: "Adresses" },
      { key: "soumissions", label: "Soumissions" },
      { key: "projets", label: "Projets" },
      { key: "factures", label: "Factures" },
      { key: "formulaires", label: "Formulaires" },
      { key: "compte", label: "Compte" },
      { key: "etat-de-compte", label: "État de compte" },
    ],
  },
  {
    screen: "Sections de l'actif",
    title: "Fiche d'un actif client",
    tabs: [
      { key: "entretiens", label: "Entretiens" },
      { key: "projets", label: "Projets" },
      { key: "taches", label: "Tâches" },
      { key: "envois", label: "Historique d'envois" },
    ],
  },
  {
    screen: "Sections du projet",
    title: "Fiche d'un projet",
    tabs: [
      { key: "taches", label: "Tâches" },
      { key: "materiaux", label: "Matériaux" },
      { key: "equipements", label: "Équipements" },
      { key: "assemblages", label: "Assemblages" },
      { key: "feuilles-de-temps", label: "Main-d'œuvre" },
      { key: "depenses", label: "Dépenses" },
      { key: "frais", label: "Frais supplémentaires" },
      { key: "soumission", label: "Soumission" },
      { key: "documents", label: "Documents et notes" },
      { key: "factures", label: "Factures" },
    ],
  },
  {
    screen: "Sections de la tâche",
    title: "Fiche d'une tâche",
    tabs: [
      { key: "feuilles-de-temps", label: "Main-d'œuvre" },
      { key: "materiaux", label: "Matériaux" },
      { key: "equipements", label: "Équipements" },
      { key: "assemblages", label: "Assemblages" },
      { key: "depenses", label: "Dépenses" },
      { key: "frais", label: "Frais supplémentaires" },
      { key: "documents", label: "Documents et notes" },
    ],
  },
  {
    screen: "Sections de la soumission",
    title: "Fiche d'une soumission",
    tabs: [
      { key: "changements", label: "Changements" },
      { key: "taches", label: "Tâches" },
      { key: "materiaux", label: "Matériaux" },
      { key: "equipements", label: "Équipements" },
      { key: "assemblages", label: "Assemblages" },
      { key: "frais", label: "Frais supplémentaires" },
      { key: "apercu", label: "Aperçu PDF" },
      { key: "envois", label: "Historique d'envois" },
    ],
  },
  {
    screen: "Sections du produit",
    title: "Fiche d'un produit",
    tabs: [
      { key: "images", label: "Images" },
      { key: "variantes", label: "Variantes" },
      { key: "fournisseurs", label: "Fournisseurs du produit" },
      { key: "inventaire", label: "Historique d'inventaire" },
      { key: "prix", label: "Historique de prix" },
      { key: "achats", label: "Historique d'achat" },
    ],
  },
  {
    screen: "Sections du dossier de l'employé",
    title: "Dossier d'un employé",
    tabs: [
      { key: "equipes", label: "Équipes" },
      { key: "contacts", label: "Contacts" },
      { key: "adresses", label: "Adresses" },
      { key: "cv", label: "CV" },
      { key: "salaires", label: "Salaires" },
      { key: "depenses", label: "Dépenses" },
      { key: "formations", label: "Formations/Permis" },
      { key: "horaire", label: "Horaire" },
      { key: "conges", label: "Demandes de congés" },
      { key: "feuilles-de-temps", label: "Feuilles de temps" },
      { key: "banque-heures", label: "Banque d'heures" },
      { key: "avantages", label: "Avantages et allocations" },
      { key: "documents", label: "Documents/Notes" },
    ],
  },
  {
    screen: "Sections du formulaire",
    title: "Fiche d'un formulaire",
    tabs: [
      { key: "questions", label: "Questions" },
      { key: "actions", label: "Actions" },
      { key: "reponses", label: "Réponses" },
      { key: "envois", label: "Envois" },
    ],
  },
];
