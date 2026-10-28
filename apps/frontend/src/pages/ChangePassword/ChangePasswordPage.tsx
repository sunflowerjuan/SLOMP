import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ApiError, getErrorMessage } from "../../api/ApiError";
import { useAuth } from "../../auth/useAuth";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Notice } from "../../components/ui/Notice";
import { useFocusOnMount } from "../../hooks/useFocusOnMount";
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
  const currentPasswordRef = useFocusOnMount<HTMLInputElement>();

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
        Tu contraseña actual te la asignó otra persona. Elige una nueva para
        entrar al panel.
      </p>

      <form className="auth-layout__form" onSubmit={handleSubmit} noValidate>
        {submitError && <Notice>{submitError}</Notice>}
        <Input
          ref={currentPasswordRef}
          label="Contraseña actual"
          type="password"
          autoComplete="current-password"
          value={fields.currentPassword}
          onChange={update("currentPassword")}
          error={errors.currentPassword}
        />
        <Input
          label="Nueva contraseña"
          type="password"
          autoComplete="new-password"
          hint={`Al menos ${MIN_PASSWORD_LENGTH} caracteres. Sirve una frase con espacios; evita contraseñas comunes.`}
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
