"use client";

import { useEffect } from "react";

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
/** How far up the screen an element has to come before it rises in: a little above the bottom. */
const TRIGGER = 0.88;

/**
 * Reveals every `.vx-reveal` element as it scrolls into view, once.
 *
 * A script rather than CSS scroll timelines: those are not in every browser yet (Firefox), and a
 * reveal only some visitors see is a reveal nobody can count on. Content is hidden only after
 * this runs — the `vx-reveal-on` class goes on the page first — so without JavaScript, or with
 * reduced motion asked for, the page is simply there.
 *
 * Positions are read on scroll (once per frame) rather than through an IntersectionObserver.
 * The catalogue and the prices stream in after the shell, and React moves those nodes into
 * place: an observer that first saw them while they were still parked out of view is never
 * told they moved. Reading the rectangles has no such gap, and a jump to #tarif or #faq shows
 * what was jumped over straight away instead of leaving it blank above the reader.
 *
 * Played with the Web Animations API rather than by setting attributes: an attribute written
 * before React has hydrated an element is one React reports as a mismatch.
 */
export function ScrollReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("animate" in Element.prototype)) return;

    const root = document.documentElement;
    root.classList.add("vx-reveal-on");

    // Per run of this effect: React mounts effects twice in development, and the second run must
    // start from nothing rather than skip what the first one saw.
    const pending = new Set<Element>();
    // What this run has already revealed. Not read from getAnimations(): hiding the elements
    // can start a brief CSS transition on them, which would pass for "already shown".
    const done = new WeakSet<Element>();
    const collect = () =>
      document.querySelectorAll(".vx-reveal").forEach((element) => {
        if (!done.has(element)) pending.add(element);
      });

    let frame = 0;
    const check = () => {
      frame = 0;
      const line = window.innerHeight * TRIGGER;
      let batch = 0;

      for (const element of pending) {
        const rect = element.getBoundingClientRect();
        // Not laid out yet: a streamed section still waiting to be put in place.
        if (rect.width === 0 && rect.height === 0) continue;
        if (rect.top > line) continue;

        pending.delete(element);
        done.add(element);

        if (rect.bottom < 0) {
          // Already above the reader: nothing to watch arrive.
          element.animate([{ opacity: 1 }], { duration: 0, fill: "forwards" });
          continue;
        }

        // Several arriving at once (a row of cards) come in one after another.
        element.animate(
          [
            { opacity: 0, translate: "0 48px", scale: "0.96" },
            { opacity: 1, translate: "0 0", scale: "1" },
          ],
          { duration: 800, easing: EASE, delay: Math.min(batch, 5) * 110, fill: "forwards" },
        );
        batch++;
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(check);
    };

    collect();
    schedule();

    const mutations = new MutationObserver(() => {
      collect();
      schedule();
    });
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      mutations.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
      root.classList.remove("vx-reveal-on");
    };
  }, []);

  return null;
}
