import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface AiSettings {
  /** Mirrors AiProvider on the server. "Copilot" is GitHub Models, not the editor's Copilot. */
  provider: "Anthropic" | "OpenAi" | "Gemini" | "Copilot";
  model: string;
  /** Whether a key is on file. The key itself never comes back from the server. */
  hasApiKey: boolean;
  isEnabled: boolean;
  canWrite: boolean;
  /** False when the plan does not include the assistant. */
  featureIncluded: boolean;
  /**
   * What the company pays per million tokens, as their provider bills them. Null until they
   * fill it in: nothing is guessed on their behalf, because an invented rate would turn the
   * figure in the header into a number that looks like a statement of account and is not one.
   */
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
}

export interface SaveAiSettingsValues {
  provider: string;
  model: string;
  /** Blank keeps the key already on file. */
  apiKey: string | null;
  isEnabled: boolean;
  canWrite: boolean;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
}

/** This month's spend. The cost is null until the company has entered its own prices. */
export interface AssistantUsage {
  inputTokens: number;
  outputTokens: number;
  cost: number | null;
}

export interface AssistantAvailability {
  available: boolean;
  reason: string | null;
  provider: string;
  model: string | null;
  canWrite: boolean;
  /** Null when no assistant is set up. */
  usage: AssistantUsage | null;
}

export interface AssistantAction {
  method: string;
  path: string;
  status: number;
  summary: string;
}

export interface AssistantReply {
  text: string;
  actions: AssistantAction[];
}

export interface AssistantTurn {
  role: "user" | "assistant";
  text: string;
}

/** Asked by everyone who works there: it decides whether the header draws the button. */
export function useAssistantAvailabilityQuery(enabled = true) {
  return useQuery({
    queryKey: ["assistant", "availability"],
    queryFn: () => api.get<AssistantAvailability>("assistant/disponibilite"),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAiSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: ["assistant", "settings"],
    queryFn: () => api.get<AiSettings>("assistant/parametres"),
    enabled,
  });
}

export function useSaveAiSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SaveAiSettingsValues) =>
      api.put<AiSettings>("assistant/parametres", values),
    onSuccess: (settings) => {
      queryClient.setQueryData(["assistant", "settings"], settings);
      // Turning it on or off changes whether the header has a button at all.
      queryClient.invalidateQueries({ queryKey: ["assistant", "availability"] });
    },
  });
}

export interface AssistantTestResult {
  /** Vexta answered its own call. False is an installation fault, not a configuration one. */
  apiReachable: boolean;
  /** The provider accepted the key and the model name. */
  modelReachable: boolean;
  message: string;
}

/**
 * Tries both links in the chain before anybody asks a question.
 *
 * Worth a button of its own: a revoked key, a model name that does not exist and a server that
 * cannot reach itself all read the same from inside a conversation — "je n'ai pas pu répondre".
 */
export function useTestAssistant() {
  return useMutation({
    mutationFn: () => api.post<AssistantTestResult>("assistant/test"),
  });
}

export function useForgetAiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>("assistant/parametres/cle"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assistant", "settings"] });
      queryClient.invalidateQueries({ queryKey: ["assistant", "availability"] });
    },
  });
}

/**
 * One turn.
 *
 * The whole transcript goes up each time, because the server keeps none of it: nothing anybody
 * types to the assistant is stored in Vexta. The cost of that is this payload; the benefit is
 * a simple honest answer to "where does what I asked it go".
 *
 * Every query is invalidated afterwards. The assistant may have created a client or changed an
 * invoice, and a page still showing what was there before the sentence it just carried out is
 * worse than a page that flickers.
 */
export function useAskAssistant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messages: AssistantTurn[]) =>
      api.post<AssistantReply>("assistant/message", { messages }),
    onSuccess: (reply) => {
      const wrote = reply.actions.some(
        (action) => action.method !== "GET" && action.status >= 200 && action.status < 300,
      );
      if (wrote) queryClient.invalidateQueries();
      // The header's figure just moved, whether or not anything was written. Without this it
      // only catches up five minutes later, which makes the number look broken rather than
      // stale to whoever is watching what a question costs them.
      queryClient.invalidateQueries({ queryKey: ["assistant", "availability"] });
    },
  });
}
