"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/*
 * The browser's own speech recognition (Chrome, Edge, Safari). Typed here because the DOM
 * library does not ship these types everywhere, and only the few members used are described.
 */
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}
interface RecognitionErrorEvent {
  readonly error: string;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const noSubscription = () => () => {};

/** What went wrong, in words the person can act on. */
function describe(error: string): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Le micro est bloqué. Autorisez-le pour ce site dans votre navigateur, puis réessayez.";
    case "audio-capture":
      return "Aucun micro n'a été trouvé. Branchez-en un, puis réessayez.";
    case "network":
      return "La dictée a besoin d'Internet. Vérifiez la connexion, puis réessayez.";
    default:
      return "La dictée s'est arrêtée. Réessayez.";
  }
}

/**
 * Dictation into a text field: what is said is written after what was already typed, live,
 * and stays editable. Nothing is sent by itself — the person reads it before it goes.
 *
 * `supported` is false on the server and in browsers without recognition (Firefox), so the
 * microphone is simply not offered there.
 */
export function useSpeechDictation({
  value,
  onChange,
  onError,
  lang = "fr-CA",
}: {
  value: string;
  onChange: (next: string) => void;
  onError: (message: string) => void;
  lang?: string;
}) {
  const supported = useSyncExternalStore(
    noSubscription,
    () => recognitionConstructor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);

  // Stopped when the component goes away, so a closed panel does not keep the microphone.
  useEffect(() => () => recognition.current?.abort(), []);

  function start() {
    const Constructor = recognitionConstructor();
    if (!Constructor || recognition.current) return;

    // What was typed before speaking stays in front; each result rewrites what follows it, so
    // a word the engine corrects mid-sentence is replaced rather than repeated.
    const base = value.trimEnd();
    const instance = new Constructor();
    instance.lang = lang;
    instance.continuous = true;
    instance.interimResults = true;

    instance.onresult = (event) => {
      let spoken = "";
      for (let index = 0; index < event.results.length; index++) {
        spoken += event.results[index][0]?.transcript ?? "";
      }
      spoken = spoken.trim();
      onChange(base && spoken ? `${base} ${spoken}` : base || spoken);
    };
    instance.onerror = (event) => {
      // Silence and a manual stop are not failures worth a message.
      if (event.error !== "no-speech" && event.error !== "aborted") onError(describe(event.error));
    };
    instance.onend = () => {
      recognition.current = null;
      setListening(false);
    };

    recognition.current = instance;
    setListening(true);
    try {
      instance.start();
    } catch {
      recognition.current = null;
      setListening(false);
      onError(describe("start"));
    }
  }

  function stop() {
    recognition.current?.stop();
  }

  return { supported, listening, start, stop, toggle: () => (listening ? stop() : start()) };
}
