import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ApiError, getErrorMessage } from "../../api/ApiError";
import { useAuth } from "../../auth/useAuth";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Notice } from "../../components/ui/Notice";
import {
  MIN_PASSWORD_LENGTH,
  validatePasswordChange,
} from "../../domain/passwordChange";
import type {
  PasswordChangeErrors,
  PasswordChangeFields,
} from "../../domain/passwordChange";
import "./ChangePasswordPage.css";

const EMPTY_FIELDS: PasswordChangeFields = {
  currentPassword: "",
  newPassword: "",
  confirmation: "",
};

// Shown instead of the panel when someone else chose the Administrator's
// password (seed, admin:create, admin:rotate-password): the backend refuses
// everything else until it is replaced.
export function ChangePasswordPage() {
  const { changePassword, signOut } = useAuth();
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [errors, setErrors] = useState<PasswordChangeErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function update(field: keyof PasswordChangeFields) {
    return (event: ChangeEvent<HTMLInputElement>) =>
      setFields((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validatePasswordChange(fields);
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      // On success AuthProvider clears the flag and the panel opens.
      await changePassword(fields.currentPassword, fields.newPassword);
    } catch (error) {
      const message = getErrorMessage(error);
      const code = error instanceof ApiError ? error.code : null;
      if (code === "AUTH_CURRENT_PASSWORD_INVALID") {
        setErrors({ currentPassword: message });
      } else if (code === "AUTH_PASSWORD_POLICY_VIOLATION") {
        setErrors({ newPassword: message });
      } else {
        setSubmitError(message);
      }
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Cambia tu contraseña"
      footer={
        <button
          type="button"
          className="change-password-page__sign-out"
          onClick={signOut}
        >
          Cerrar sesión
        </button>
      }
    >
      <p className="change-password-page__intro">
        Tu contraseña actual fue asignada por otra persona. Elige una nueva para
        entrar al panel: desde ese momento solo tú la conocerás.
      </p>
      <ul className="change-password-page__rules">
        <li>Usa al menos {MIN_PASSWORD_LENGTH} caracteres.</li>
        <li>
          Puedes usar una frase con espacios; no hace falta mezclar símbolos.
        </li>
        <li>Evita contraseñas comunes o palabras con números al final.</li>
      </ul>

      <form className="auth-layout__form" onSubmit={handleSubmit} noValidate>
        {submitError && <Notice>{submitError}</Notice>}
        <Input
          label="Contraseña actual"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={fields.currentPassword}
          onChange={update("currentPassword")}
          error={errors.currentPassword}
        />
        <Input
          label="Nueva contraseña"
          type="password"
          autoComplete="new-password"
          value={fields.newPassword}
          onChange={update("newPassword")}
          error={errors.newPassword}
        />
        <Input
          label="Confirma la nueva contraseña"
          type="password"
          autoComplete="new-password"
          value={fields.confirmation}
          onChange={update("confirmation")}
          error={errors.confirmation}
        />

        <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
          Guardar contraseña
        </Button>
      </form>
    </AuthLayout>
  );
}
