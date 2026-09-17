import { useId, useState } from "react";
import type { InputHTMLAttributes } from "react";
import "./Input.css";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string;
  id?: string;
}

export function Input({
  label,
  error,
  type,
  className,
  id,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword && showPassword ? "text" : type;

  const classes = [
    "ui-input",
    isPassword ? "ui-input--with-toggle" : "",
    error ? "ui-input--error" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="ui-input-group">
      <label className="ui-input-label" htmlFor={inputId}>
        {label}
      </label>
      <div className="ui-input-wrapper">
        <input
          id={inputId}
          type={resolvedType}
          className={classes}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            className="ui-input-toggle"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={
              showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
            }
          >
            {showPassword ? "Ocultar" : "Mostrar"}
          </button>
        )}
      </div>
      {error && (
        <p className="ui-input-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
