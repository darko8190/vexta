import { Bug, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  feedbackKindLabel,
  feedbackStatusLabel,
  type FeedbackKind,
  type FeedbackStatus,
} from "@/hooks/use-feedback";

const statusStyles: Record<FeedbackStatus, string> = {
  Sent: "border-border bg-muted text-foreground",
  InProgress: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200",
  Resolved: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
};

export function FeedbackStatusBadge({ status, kind }: { status: FeedbackStatus; kind?: FeedbackKind }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        statusStyles[status],
      )}
    >
      {feedbackStatusLabel(status, kind)}
    </span>
  );
}

export function FeedbackKindLabel({ kind }: { kind: FeedbackKind }) {
  const Icon = kind === "bug" ? Bug : Lightbulb;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
      <Icon className="size-4 text-muted-foreground" />
      {feedbackKindLabel(kind)}
    </span>
  );
}
