import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import "./Button.css";

type ButtonVariant = "primary" | "secondary" | "danger";
type ButtonSize = "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

function buttonClasses({
  variant,
  size,
  fullWidth,
  loading,
  className,
}: {
  variant: ButtonVariant;
  size: ButtonSize;
  fullWidth: boolean;
  loading: boolean;
  className?: string;
}): string {
  return [
    "ui-button",
    `ui-button--${variant}`,
    `ui-button--${size}`,
    fullWidth ? "ui-button--full-width" : "",
    loading ? "ui-button--loading" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = buttonClasses({
    variant,
    size,
    fullWidth,
    loading,
    className,
  });

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading}
      {...rest}
    >
      {loading && <span className="ui-button__spinner" aria-hidden="true" />}
      <span className="ui-button__label">{children}</span>
    </button>
  );
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
}

// Looks like a button but goes to another screen, so it is a link: it opens
// in a new tab, shows its address and is announced as a link.
export function ButtonLink({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <a
      className={buttonClasses({
        variant,
        size,
        fullWidth,
        loading: false,
        className,
      })}
      {...rest}
    >
      <span className="ui-button__label">{children}</span>
    </a>
  );
}
