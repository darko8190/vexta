"use client";

import { useState, useSyncExternalStore } from "react";
import { Download, Share } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Chrome and Edge only; the event is not in lib.dom. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const REFUSAL_KEY = "vexta.installation-refusee";

function readRefusal(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(REFUSAL_KEY) === "1";
  } catch {
    // Private browsing and blocked site data make this throw rather than return null. Offering
    // the installation once more is the harmless half of the mistake.
    return false;
  }
}

function writeRefusal() {
  try {
    window.localStorage.setItem(REFUSAL_KEY, "1");
  } catch {
    // The refusal still holds for this page; it just will not survive a reload.
  }
}

/*
 * The deferred event and the refusal live in the module rather than in component state.
 *
 * beforeinstallprompt fires once per page load, and whichever copy of this component happens to
 * be mounted at that moment is the only one that would see it — the copy inside the mobile menu
 * mounts when the menu opens, long after. Keeping the event here lets a copy that mounts later
 * still find it, and lets a refusal in one copy hide the other.
 */
interface InstallState {
  prompt: BeforeInstallPromptEvent | null;
  refused: boolean;
}

/** Nothing is offered during a server render: see readStateOnServer below. */
const HIDDEN: InstallState = { prompt: null, refused: true };

let state: InstallState = { prompt: null, refused: readRefusal() };
const listeners = new Set<() => void>();

function setState(next: InstallState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function readState(): InstallState {
  return state;
}

/**
 * The server cannot know whether the app is already installed or was turned down, and an
 * invitation that appears for one frame and then withdraws itself reads as a glitch. Arriving a
 * frame late, on the other hand, is invisible.
 */
function readStateOnServer(): InstallState {
  return HIDDEN;
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Without this, Chrome shows its own banner. The invitation belongs beside the app's other
    // actions, where it can be ignored.
    event.preventDefault();
    setState({ ...state, prompt: event as BeforeInstallPromptEvent });
  });

  window.addEventListener("appinstalled", () => {
    setState({ ...state, prompt: null });
  });
}

const STANDALONE_QUERY = "(display-mode: standalone)";

function subscribeToDisplayMode(onChange: () => void) {
  const query = window.matchMedia(STANDALONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readStandalone(): boolean {
  return (
    window.matchMedia(STANDALONE_QUERY).matches ||
    // iOS predates display-mode and marks an installed app on navigator instead.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function readStandaloneOnServer(): boolean {
  return true;
}

function readIsApple(): boolean {
  if (typeof window === "undefined") return false;

  const { userAgent, maxTouchPoints } = window.navigator;

  // An iPad on iPadOS reports itself as a Mac, so a Mac that answers to touch counts as one.
  return /iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

/**
 * The "Installer l'application" entry, shown only when there is something to install.
 *
 * Chrome and Edge, on Android and on desktop, hand us an event we can replay on click. Safari
 * never fires it and has no API at all, so on an Apple device the entry opens the two steps the
 * person has to perform by hand.
 */
export function InstallPrompt({ className }: { className?: string }) {
  const standalone = useSyncExternalStore(
    subscribeToDisplayMode,
    readStandalone,
    readStandaloneOnServer,
  );
  const { prompt, refused } = useSyncExternalStore(subscribe, readState, readStateOnServer);
  const [isApple] = useState(readIsApple);
  const [helpOpen, setHelpOpen] = useState(false);

  // Already installed, already turned down, or a browser that cannot install anything.
  if (standalone || refused || (!prompt && !isApple)) return null;

  const trigger = (
    <Button
      variant="outline"
      size="sm"
      className={cn(className)}
      onClick={prompt ? handleInstall : () => setHelpOpen(true)}
    >
      <Download />
      Installer l&apos;application
    </Button>
  );

  if (prompt) return trigger;

  return (
    <>
      {trigger}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Installer Vexta sur cet appareil</DialogTitle>
            <DialogDescription>
              Safari n&apos;installe pas une application tout seul. Deux gestes suffisent, et
              Vexta s&apos;ouvre ensuite comme n&apos;importe quelle autre application.
            </DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Touchez{" "}
              <Share className="inline size-3.5 align-text-bottom text-foreground" aria-hidden />{" "}
              <span className="text-foreground">Partager</span>, dans la barre du navigateur.
            </li>
            <li>
              Choisissez{" "}
              <span className="text-foreground">« Sur l&apos;écran d&apos;accueil »</span>, puis
              confirmez avec <span className="text-foreground">« Ajouter »</span>.
            </li>
          </ol>
          <DialogFooter>
            <Button variant="ghost" onClick={handleRefuse}>
              Ne plus proposer
            </Button>
            <Button onClick={() => setHelpOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  async function handleInstall() {
    if (!prompt) return;

    await prompt.prompt();
    const { outcome } = await prompt.userChoice;

    // The event is single-use: Chrome fires a fresh one if the app is still installable.
    setState({ prompt: null, refused: outcome === "dismissed" });
    if (outcome === "dismissed") writeRefusal();
  }

  function handleRefuse() {
    writeRefusal();
    setState({ prompt: null, refused: true });
    setHelpOpen(false);
  }
}
