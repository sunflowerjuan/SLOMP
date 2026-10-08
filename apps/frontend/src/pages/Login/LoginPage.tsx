import { useState } from "react";
import type { FormEvent } from "react";
import { getErrorMessage } from "../../api/ApiError";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Notice } from "../../components/ui/Notice";
import { PUBLIC_CONSULTATION_HREF } from "../../routes";
import "./LoginPage.css";

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
  const { signIn, sessionExpired } = useAuth();

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
    <div className="login-page">
      <aside className="login-page__institutional">
        <div className="login-page__grid" aria-hidden="true" />
        <div className="login-page__brand">
          <span className="login-page__brand-tag">SLOMP</span>
          <span className="login-page__brand-name">Tributaria Predial</span>
        </div>
      </aside>

      <main className="login-page__content">
        <div className="login-page__card">
          <h1 className="login-page__title">Ingresar</h1>

          <form className="login-page__form" onSubmit={handleSubmit} noValidate>
            {sessionExpired && !submitError && (
              <Notice variant="info">
                Tu sesión expiró. Vuelve a iniciar sesión para continuar.
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

          <p className="login-page__public-link">
            ¿Eres contribuyente?{" "}
            <a href={PUBLIC_CONSULTATION_HREF}>
              Consulta tus liquidaciones sin iniciar sesión
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
