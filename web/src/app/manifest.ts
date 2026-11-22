import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vexta",
    short_name: "Vexta",
    description:
      "Vos clients, vos projets et votre facturation dans un espace de travail propre à votre entreprise.",
    lang: "fr-CA",
    dir: "ltr",
    // The installed app opens on the workspace, not on the marketing page: someone who went to
    // the trouble of installing Vexta is a customer, and "/" would hand them the sales pitch
    // they already said yes to. The dashboard group redirects to /connexion when no session is
    // open, so a signed-out launch still lands somewhere useful.
    start_url: "/tableau-de-bord",
    // The installed app's identity, pinned now rather than later: without it a browser
    // identifies the app by its start_url, so moving that page one day would be read as a
    // different application and leave people with two Vexta icons, one of them dead.
    id: "/",
    // Everything the app does lives under the same origin, so the whole site is in scope and a
    // link out of it leaves the installed window.
    scope: "/",
    display: "standalone",
    orientation: "any",
    // Both taken from the light theme's --background: the window paints that colour while the
    // app boots, and the OS tints its chrome with it, so the two match whatever the person's
    // theme turns out to be rather than flashing a white frame around a dark app.
    background_color: "#f9fafb",
    theme_color: "#f9fafb",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Declared separately rather than as "any maskable" on one file: Android crops a maskable
      // icon to its safe zone, and the plain mark already fills its square edge to edge.
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
