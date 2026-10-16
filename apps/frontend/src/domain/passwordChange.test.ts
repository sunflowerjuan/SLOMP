import { describe, expect, it } from "vitest";
import { messageForErrorCode } from "../api/errorMessages";
import { validatePasswordChange } from "./passwordChange";

const VALID = {
  currentPassword: "contraseña inicial entregada",
  newPassword: "una frase larga que nadie conoce",
  confirmation: "una frase larga que nadie conoce",
};

describe("validatePasswordChange", () => {
  it("accepts a complete form", () => {
    expect(validatePasswordChange(VALID)).toEqual({});
  });

  it("asks for every empty field", () => {
    expect(
      Object.keys(
        validatePasswordChange({
          currentPassword: "",
          newPassword: "",
          confirmation: "",
        }),
      ),
    ).toEqual(["currentPassword", "newPassword", "confirmation"]);
  });

  it("catches a short new password, one equal to the current one and a mismatch", () => {
    expect(
      validatePasswordChange({
        ...VALID,
        newPassword: "corta",
        confirmation: "corta",
      }).newPassword,
    ).toMatch(/al menos 12 caracteres/);
    expect(
      validatePasswordChange({
        ...VALID,
        newPassword: VALID.currentPassword,
        confirmation: VALID.currentPassword,
      }).newPassword,
    ).toMatch(/distinta de la actual/);
    expect(
      validatePasswordChange({ ...VALID, confirmation: "otra cosa" })
        .confirmation,
    ).toBe("Las contraseñas no coinciden.");
  });
});

describe("AUTH_PASSWORD_POLICY_VIOLATION message", () => {
  it("lists what the new password still needs", () => {
    expect(
      messageForErrorCode("AUTH_PASSWORD_POLICY_VIOLATION", {
        violations: ["TOO_SHORT", "COMMON"],
      }),
    ).toBe(
      "La nueva contraseña debe tener al menos 12 caracteres. Además, es muy común o fácil de adivinar: evita palabras conocidas, secuencias como 123456 y números o símbolos al final.",
    );
    expect(
      messageForErrorCode("AUTH_PASSWORD_POLICY_VIOLATION", {
        violations: ["SAME_AS_CURRENT"],
      }),
    ).toBe("La nueva contraseña debe ser distinta de la actual.");
  });

  it("explains a common password on its own", () => {
    expect(
      messageForErrorCode("AUTH_PASSWORD_POLICY_VIOLATION", {
        violations: ["COMMON"],
      }),
    ).toBe(
      "La nueva contraseña es muy común o fácil de adivinar: evita palabras conocidas, secuencias como 123456 y números o símbolos al final.",
    );
  });

  it("falls back to the general rule without details", () => {
    expect(messageForErrorCode("AUTH_PASSWORD_POLICY_VIOLATION")).toMatch(
      /al menos 12 caracteres/,
    );
  });
});
