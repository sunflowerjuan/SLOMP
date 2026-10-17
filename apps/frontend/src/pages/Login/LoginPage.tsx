import { useState } from "react";
import type { FormEvent } from "react";
import { getErrorMessage } from "../../api/ApiError";
import { useAuth } from "../../auth/useAuth";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Notice } from "../../components/ui/Notice";
import { readLastMunicipalitySlug } from "../../api/lastMunicipality";
import { DEFAULT_PUBLIC_CONSULTATION_SLUG } from "../../api/municipality";
import { currentAdminSlug, publicConsultationHref } from "../../routes";

interface LoginFormErrors {
  email?: string;
  password?: string;
}

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { signIn, sessionEndReason } = useAuth();

  function validate(): LoginFormErrors {
    const nextErrors: LoginFormErrors = {};
    if (!email.trim()) {
      nextErrors.email = "El correo electrónico es obligatorio.";
    }
    if (!password.trim()) {
      nextErrors.password = "La contraseña es obligatoria.";
    }
    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    setSubmitError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      // On success, AuthProvider marks the session and App replaces this
      // screen with the panel.
      await signIn(email.trim(), password);
    } catch (error) {
      setSubmitError(
        getErrorMessage(error, {
          unauthorizedMessage: "Correo o contraseña incorrectos.",
        }),
      );
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Ingresar"
      footer={
        <>
          ¿Eres contribuyente?{" "}
          <a
            href={publicConsultationHref(
              currentAdminSlug() ??
                readLastMunicipalitySlug() ??
                DEFAULT_PUBLIC_CONSULTATION_SLUG,
            )}
          >
            Consulta tus liquidaciones sin iniciar sesión
          </a>
        </>
      }
    >
      <form className="auth-layout__form" onSubmit={handleSubmit} noValidate>
        {sessionEndReason && !submitError && (
          <Notice variant="info">
            {sessionEndReason === "inactivity"
              ? "Cerramos tu sesión porque estuvo inactiva. Vuelve a iniciar sesión para continuar."
              : "Tu sesión expiró. Vuelve a iniciar sesión para continuar."}
          </Notice>
        )}
        {submitError && <Notice>{submitError}</Notice>}
        <Input
          label="Correo electrónico"
          type="email"
          autoComplete="username"
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
        />
        <Input
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
        />

        <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
          Ingresar
        </Button>
      </form>
    </AuthLayout>
  );
}
