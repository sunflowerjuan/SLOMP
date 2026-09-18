import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    // TODO(SL-49): conectar con POST /login del backend cuando el contrato esté confirmado.
    setIsSubmitting(false);
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
            <Input
              label="Correo electrónico"
              type="email"
              autoComplete="username"
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
        </div>
      </main>
    </div>
  );
}
