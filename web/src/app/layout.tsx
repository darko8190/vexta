import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ServiceWorker } from "@/components/pwa/service-worker";
import { Providers } from "@/lib/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vexta",
  description: "Vexta — plateforme de gestion de clients, projets et facturation.",
  // Points at the route, not at app/icon.png, so the super admin's uploaded icon becomes the
  // browser tab icon too. The route falls back to that same bundled file when nothing is set.
  icons: { icon: "/branding/icon", apple: "/branding/icon" },
  // iOS has no manifest support worth the name: without these the app opens in a Safari tab
  // with its address bar, and the home screen reads "Vexta — plateforme de gestion…".
  appleWebApp: {
    capable: true,
    title: "Vexta",
    // The app paints its own background behind the status bar, so the bar only has to borrow it
    // rather than draw a band of its own.
    statusBarStyle: "default",
  },
};

// Both drawn from --background in globals.css, one per theme, so the browser chrome and the OS
// task switcher match the app instead of framing a dark screen in white.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9fafb" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0d12" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes writes the theme class onto <html> before
    // React hydrates, so the server markup and the client tree differ by design.
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>
          <TooltipProvider>{children}</TooltipProvider>
        </Providers>
        <Toaster richColors position="top-right" />
        <ServiceWorker />
      </body>
    </html>
  );
}
