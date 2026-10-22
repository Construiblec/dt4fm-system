import type { ReporterKind } from "@/shared/components/CorrectiveCard";

const REPORTER_SUFFIX: Partial<Record<ReporterKind, string>> = {
  guest: " (huésped)",
  visitor: " (visitante)",
};

/** Nombre de quien reportó, marcando huésped o visitante. */
export const formatReporter = (
  reporter: { name: string; kind: ReporterKind } | null | undefined,
): string | null =>
  reporter ? reporter.name + (REPORTER_SUFFIX[reporter.kind] ?? "") : null;
