"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CircleCheck, Minus, PartyPopper } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { guideSteps, visibleSteps, type GuideStep } from "@/components/setup-guide/guide-steps";
import { useBillingStateQuery } from "@/hooks/use-billing";
import {
  emptyGuideState,
  useSaveSetupGuide,
  useSetupGuideQuery,
  type GuideAnswer,
  type SetupGuideState,
} from "@/hooks/use-setup-guide";
import { cn } from "@/lib/utils";

/**
 * The setup guide: every setting asked as a plain question, one at a time, in the order a new
 * company needs them. The steps live in guide-steps.tsx; this page only walks through them and
 * remembers where the owner stopped.
 */
export default function SetupGuidePage() {
  const { data: billing, isLoading } = useBillingStateQuery();
  const canManage = billing?.kind === "Business" && billing.canManage;
  const { data: saved, isLoading: guideLoading } = useSetupGuideQuery(canManage === true);

  if (isLoading || (canManage && guideLoading)) return <Skeleton className="h-96 w-full" />;

  if (!canManage) {
    return (
      <Alert className="max-w-lg">
        <AlertTitle>Réservé au propriétaire</AlertTitle>
        <AlertDescription>Seul le propriétaire de l&apos;entreprise configure Vexta.</AlertDescription>
      </Alert>
    );
  }

  return <Guide initial={saved ?? emptyGuideState} />;
}

function Guide({ initial }: { initial: SetupGuideState }) {
  const save = useSaveSetupGuide();
  const [state, setState] = useState<SetupGuideState>(initial);
  const steps = visibleSteps(state.answers);
  const firstOpen = steps.find((step) => !state.seen.includes(step.key));
  const [currentKey, setCurrentKey] = useState<string | null>(
    () => (state.current && steps.some((step) => step.key === state.current) ? state.current : firstOpen?.key ?? null),
  );
  const index = currentKey ? steps.findIndex((step) => step.key === currentKey) : -1;
  const step = index >= 0 ? steps[index] : null;
  const seenCount = steps.filter((item) => state.seen.includes(item.key)).length;

  function persist(next: SetupGuideState) {
    setState(next);
    save.mutate(next);
  }

  /** Marks the step gone through and opens the next one not yet done, or the end. */
  function advance(from: GuideStep, answers = state.answers) {
    const seen = state.seen.includes(from.key) ? state.seen : [...state.seen, from.key];
    const list = visibleSteps(answers);
    const position = list.findIndex((item) => item.key === from.key);
    const next = list.slice(position + 1).find((item) => !seen.includes(item.key)) ?? list.find((item) => !seen.includes(item.key));
    setCurrentKey(next?.key ?? null);
    persist({ ...state, answers, seen, current: next?.key });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function open(key: string) {
    setCurrentKey(key);
    persist({ ...state, current: key });
  }

  function answer(target: GuideStep, value: GuideAnswer) {
    const answers = { ...state.answers, [target.key]: value };
    // "Non", or a question with nothing behind it: the answer is the whole step.
    if (value === "non" || !target.render) {
      advance(target, answers);
    } else {
      persist({ ...state, answers });
    }
  }

  function goBack() {
    if (index > 0) open(steps[index - 1].key);
  }

  const groups = steps.reduce<{ name: string; items: GuideStep[] }[]>((list, item) => {
    const last = list[list.length - 1];
    if (last && last.name === item.group) last.items.push(item);
    else list.push({ name: item.group, items: [item] });
    return list;
  }, []);

  return (
    <div>
      <PageHeader
        title="Guide de configuration"
        description="Quelques questions simples pour préparer Vexta à votre façon. Vous pouvez arrêter et revenir quand vous voulez."
        action={
          <Link href="/tableau-de-bord" className={cn(buttonVariants({ variant: "outline" }))}>
            Terminer plus tard
          </Link>
        }
      />

      <div className="mb-6">
        <div className="mb-1.5 flex justify-between text-sm text-muted-foreground">
          <span>
            {seenCount} sur {steps.length} étapes
          </span>
          <span>{Math.round((seenCount / Math.max(steps.length, 1)) * 100)} %</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={seenCount}>
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(seenCount / Math.max(steps.length, 1)) * 100}%` }} />
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* The whole list, so the owner sees how far there is to go and can jump around. */}
        <nav aria-label="Étapes du guide" className="hidden w-64 shrink-0 lg:block">
          <ol className="space-y-5">
            {groups.map((group) => (
              <li key={group.name}>
                <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.name}</p>
                <ol className="space-y-0.5">
                  {group.items.map((item) => {
                    const seen = state.seen.includes(item.key);
                    const declined = state.answers[item.key] === "non";
                    return (
                      <li key={item.key}>
                        <button
                          type="button"
                          onClick={() => open(item.key)}
                          aria-current={item.key === currentKey ? "step" : undefined}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                            item.key === currentKey ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded-full border",
                              seen && !declined && "border-primary bg-primary text-primary-foreground",
                              declined && "border-border bg-muted",
                            )}
                          >
                            {seen && !declined && <Check className="size-3" />}
                            {declined && <Minus className="size-3" />}
                          </span>
                          {item.title}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 flex-1">
          {step ? (
            <StepView
              key={step.key}
              step={step}
              number={index + 1}
              total={steps.length}
              answer={state.answers[step.key]}
              onAnswer={(value) => answer(step, value)}
              onChangeAnswer={() => {
                const answers = { ...state.answers };
                delete answers[step.key];
                persist({ ...state, answers });
              }}
              onDone={() => advance(step)}
              onBack={index > 0 ? goBack : undefined}
            />
          ) : (
            <Finished onReview={() => open(guideSteps[0].key)} />
          )}
        </div>
      </div>
    </div>
  );
}

function StepView({
  step,
  number,
  total,
  answer,
  onAnswer,
  onChangeAnswer,
  onDone,
  onBack,
}: {
  step: GuideStep;
  number: number;
  total: number;
  answer: GuideAnswer | undefined;
  onAnswer: (value: GuideAnswer) => void;
  onChangeAnswer: () => void;
  onDone: () => void;
  onBack?: () => void;
}) {
  const asking = step.ask && answer === undefined;
  const showForm = step.render && (!step.ask || answer === "oui");

  return (
    <section aria-labelledby="guide-question" className="max-w-3xl">
      <p className="text-sm text-muted-foreground">
        {step.group} · Étape {number} sur {total}
      </p>
      <h2 id="guide-question" className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
        {step.question}
      </h2>
      <div className="mt-3 max-w-2xl text-base text-muted-foreground">{step.explain}</div>

      {asking && step.ask && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" className="sm:min-w-44" onClick={() => onAnswer("oui")}>
            {step.ask.yes}
          </Button>
          <Button size="lg" variant="outline" className="sm:min-w-44" onClick={() => onAnswer("non")}>
            {step.ask.no}
          </Button>
        </div>
      )}

      {step.ask && answer === "non" && (
        <Alert className="mt-6">
          <AlertTitle>Vous avez répondu non.</AlertTitle>
          <AlertDescription>
            {step.ask.noNote ?? "Rien à configurer ici. Vous pourrez y revenir dans Paramètres."}
          </AlertDescription>
        </Alert>
      )}

      {step.ask && answer !== undefined && (
        <Button variant="link" className="mt-2 h-auto px-0" onClick={onChangeAnswer}>
          Changer ma réponse
        </Button>
      )}

      {showForm && (
        <div className="mt-6">
          {step.render!({ onDone })}
          {!step.selfAdvancing && (
            <p className="mt-3 text-sm text-muted-foreground">
              Enregistrez vos changements, puis cliquez sur Continuer.
            </p>
          )}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft />
            Précédent
          </Button>
        )}
        <div className="ml-auto flex gap-3">
          {(!asking || answer === "non") && !(showForm && step.selfAdvancing) && (
            <Button onClick={onDone}>Continuer</Button>
          )}
          {(asking || (showForm && step.selfAdvancing)) && (
            <Button variant="outline" onClick={onDone}>
              Passer cette étape
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function Finished({ onReview }: { onReview: () => void }) {
  return (
    <div className="max-w-xl rounded-xl border border-border bg-card p-8 text-center">
      <PartyPopper className="mx-auto size-10 text-primary" />
      <h2 className="mt-4 text-2xl font-semibold text-foreground">C&apos;est terminé !</h2>
      <p className="mt-2 text-muted-foreground">
        Vexta est prêt. Vous pouvez changer chaque réponse quand vous voulez dans Paramètres, ou repasser par ce guide.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Link href="/tableau-de-bord" className={cn(buttonVariants())}>
          <CircleCheck />
          Aller au tableau de bord
        </Link>
        <Button variant="outline" onClick={onReview}>
          Revoir mes réponses
        </Button>
      </div>
    </div>
  );
}
