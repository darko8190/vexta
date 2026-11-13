import Image from "next/image";
import Link from "next/link";

const columns = [
  {
    title: "Produit",
    links: [
      { href: "/#fonctionnalites", label: "Fonctionnalités" },
      { href: "/#tarif", label: "Tarif" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    title: "Compte",
    links: [
      { href: "/connexion", label: "Se connecter" },
      { href: "/inscription", label: "Créer un compte" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <Image src="/vexta-logo.png" alt="Vexta" width={120} height={60} className="h-7 w-auto" />
            <p className="mt-4 text-sm text-muted-foreground">
              Clients, adresses, projets et factures réunis dans un seul outil.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:gap-20">
            {columns.map((column) => (
              <div key={column.title}>
                <h2 className="text-sm font-medium text-foreground">{column.title}</h2>
                <ul className="mt-4 space-y-3">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
          © Vexta. Tous droits réservés.
        </p>
      </div>
    </footer>
  );
}
