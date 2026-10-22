import { useState, type FormEvent } from "react";
import axios from "axios";
import { ChevronDown, KeyRound } from "lucide-react";
import { changePassword } from "@/services/api";
import { getRoleLabel, getRoleView } from "@/shared/constants/rolePalette";
import { formatEmployeeName } from "@/shared/utils/nameUtils";
import { useSessionStore } from "@/store/sessionStore";
import {
  Button,
  Card,
  Field,
  FOCUS,
  InlineAlert,
  PageHeader,
} from "../components/ui";
import { cx, inputClass } from "../components/uiUtils";

const MIN_PASSWORD_LENGTH = 8;

const initials = (name: string) =>
  name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/** Mi perfil: quién soy, con qué rol trabajo y el cambio de contraseña (el mismo servicio que "Mi cuenta"). */
export const PerfilPage = () => {
  const sessionId = useSessionStore((s) => s.sessionId);
  const username = useSessionStore((s) => s.username);
  const role = useSessionStore((s) => s.role);
  const roleLabels = useSessionStore((s) => s.roleLabels);
  const view = getRoleView(role);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<{
    current?: string;
    next?: string;
    repeat?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setResult(null);

    const found: typeof errors = {};
    if (!current) found.current = "Escribe tu contraseña actual.";
    if (next.length < MIN_PASSWORD_LENGTH) {
      found.next = `Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`;
    }
    if (repeat !== next) found.repeat = "Las contraseñas no coinciden.";
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      await changePassword(sessionId, current, next);
      setResult({ ok: true, text: "Contraseña actualizada correctamente." });
      setCurrent("");
      setNext("");
      setRepeat("");
    } catch (error) {
      // El 400 es el único caso que el usuario puede corregir por sí mismo.
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      setResult({
        ok: false,
        text:
          status === 400
            ? "La contraseña actual es incorrecta."
            : "No se pudo actualizar la contraseña.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Mi perfil"
        subtitle="Tus datos de acceso y tu contraseña."
      />

      <Card>
        <div className="flex items-center gap-4">
          <span
            className={cx(
              "grid h-14 w-14 shrink-0 place-items-center rounded-full text-lg font-bold text-white",
              view.solid,
            )}
          >
            {initials(username)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-slate-900">
              {formatEmployeeName(username)}
            </p>
            <p className="truncate text-sm text-slate-500">
              <span className="font-mono">{username}</span> ·{" "}
              {getRoleLabel(role, roleLabels)}
            </p>
          </div>
        </div>
      </Card>

      {/* Plegado de inicio: se abre solo para cambiar la contraseña. */}
      <details className="group min-w-0 rounded-2xl bg-white shadow-sm">
        <summary
          className={cx(
            "flex cursor-pointer list-none items-center gap-3 rounded-2xl px-5 py-4 [&::-webkit-details-marker]:hidden",
            FOCUS,
          )}
        >
          <KeyRound
            className="h-5 w-5 shrink-0 text-slate-400"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-slate-900">
              Cambiar contraseña
            </span>
            <span className="mt-0.5 block text-sm text-slate-500">
              Necesitas tu contraseña actual. La nueva debe tener al menos 8
              caracteres.
            </span>
          </span>
          <ChevronDown
            className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <form
          onSubmit={(e) => void submit(e)}
          className="space-y-4 border-t border-slate-100 px-5 py-4"
          noValidate
        >
          <Field
            label="Contraseña actual"
            htmlFor="pwd-actual"
            required
            error={errors.current}
          >
            <input
              id="pwd-actual"
              type="password"
              autoComplete="current-password"
              className={inputClass(errors.current)}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Contraseña nueva"
              htmlFor="pwd-nueva"
              required
              error={errors.next}
            >
              <input
                id="pwd-nueva"
                type="password"
                autoComplete="new-password"
                className={inputClass(errors.next)}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </Field>
            <Field
              label="Repite la contraseña nueva"
              htmlFor="pwd-repetir"
              required
              error={errors.repeat}
            >
              <input
                id="pwd-repetir"
                type="password"
                autoComplete="new-password"
                className={inputClass(errors.repeat)}
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              />
            </Field>
          </div>

          {result ? (
            <InlineAlert tone={result.ok ? "success" : "error"}>
              {result.text}
            </InlineAlert>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              icon={KeyRound}
              loading={submitting}
              disabled={submitting}
            >
              {submitting ? "Guardando…" : "Guardar contraseña"}
            </Button>
          </div>
        </form>
      </details>
    </div>
  );
};
