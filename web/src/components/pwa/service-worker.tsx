"use client";

import { useEffect } from "react";

/**
 * Registers the service worker once the app is running, and only in a production build.
 *
 * In development a service worker sits in front of Turbopack's HMR and happily serves chunks
 * from a build that no longer exists, which shows up as a blank screen or a module error that
 * no edit fixes. Worse, a worker registered once stays registered across restarts, so the dev
 * branch below actively tears down anything left over from a production build served on the
 * same origin.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => registrations.forEach((registration) => registration.unregister()))
        .catch(() => undefined);
      return;
    }

    // After load rather than on mount: registration competes with the first paint's requests,
    // and the worker is of no use until the next visit anyway.
    const register = () => {
      // updateViaCache: "none" so the browser revalidates sw.js itself instead of serving the
      // previous one from its HTTP cache for up to a day.
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
