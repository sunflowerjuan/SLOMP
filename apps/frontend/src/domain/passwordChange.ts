// Client-side checks for the password change form. The backend has the final
// word (security policy, 4.3), including the list of common passwords; this
// only spares a round trip for the obvious mistakes.
export const MIN_PASSWORD_LENGTH = 12;

export interface PasswordChangeFields {
  currentPassword: string;
  newPassword: string;
  confirmation: string;
}

export type PasswordChangeErrors = Partial<
  Record<keyof PasswordChangeFields, string>
>;

export function validatePasswordChange({
  currentPassword,
  newPassword,
  confirmation,
}: PasswordChangeFields): PasswordChangeErrors {
  const errors: PasswordChangeErrors = {};
  if (!currentPassword) {
    errors.currentPassword = "Ingresa tu contraseña actual.";
  }
  if (!newPassword) {
    errors.newPassword = "Ingresa la nueva contraseña.";
  } else if ([...newPassword].length < MIN_PASSWORD_LENGTH) {
    errors.newPassword = `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  } else if (newPassword === currentPassword) {
    errors.newPassword = "La nueva contraseña debe ser distinta de la actual.";
  }
  if (!confirmation) {
    errors.confirmation = "Confirma la nueva contraseña.";
  } else if (confirmation !== newPassword) {
    errors.confirmation = "Las contraseñas no coinciden.";
  }
  return errors;
}
