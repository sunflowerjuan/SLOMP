import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, getErrorMessage } from "../../api/ApiError";
import { messageForErrorCode } from "../../api/errorMessages";
import { createMunicipality } from "../../api/municipalities";
import type { Municipality, NewMunicipality } from "../../api/municipalities";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Notice } from "../../components/ui/Notice";
import {
  DANE_CODE_LENGTH,
  MAX_SLUG_LENGTH,
  isReservedSlug,
  isValidDaneCode,
  isValidSlug,
  suggestSlug,
} from "../../domain/municipality";
import "./AddMunicipalityForm.css";

type FieldErrors = Partial<Record<keyof NewMunicipality, string>>;

// Backend codes that belong to one field: shown under it, not in a banner.
const FIELD_OF_CODE: Record<string, keyof NewMunicipality> = {
  MUNICIPALITY_INVALID_DANE: "daneCode",
  MUNICIPALITY_DANE_TAKEN: "daneCode",
  MUNICIPALITY_INVALID_SLUG: "slug",
  MUNICIPALITY_SLUG_TAKEN: "slug",
};

// Per-field checks before sending, like the login form. The DANE and slug
// texts are the catalog's, since the backend checks the same rules.
function validate(form: NewMunicipality): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name) errors.name = "Ingresa el nombre del municipio.";
  if (!form.state) errors.state = "Ingresa el departamento.";
  if (!isValidDaneCode(form.daneCode)) {
    errors.daneCode = messageForErrorCode("MUNICIPALITY_INVALID_DANE") ?? "";
  }
  if (!form.slug) {
    errors.slug = "Ingresa el identificador.";
  } else if (isReservedSlug(form.slug)) {
    errors.slug =
      "Ese identificador está reservado para la consulta pública. Usa otro.";
  } else if (!isValidSlug(form.slug)) {
    errors.slug = messageForErrorCode("MUNICIPALITY_INVALID_SLUG") ?? "";
  }
  return errors;
}

interface AddMunicipalityFormProps {
  onCancel: () => void;
  onCreated: (municipality: Municipality) => void;
  onBusyChange: (busy: boolean) => void;
}

// Mounted only while its dialog is open, so every opening starts empty.
export function AddMunicipalityForm({
  onCancel,
  onCreated,
  onBusyChange,
}: AddMunicipalityFormProps) {
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [daneCode, setDaneCode] = useState("");
  // Follows the name until the super user writes their own.
  const [customSlug, setCustomSlug] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const slug = customSlug ?? suggestSlug(name);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form: NewMunicipality = {
      name: name.trim(),
      state: state.trim(),
      daneCode: daneCode.trim(),
      slug: slug.trim(),
    };
    const found = validate(form);
    setErrors(found);
    setFormError("");
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    onBusyChange(true);
    try {
      onCreated(await createMunicipality(form));
    } catch (caught) {
      const field =
        caught instanceof ApiError && caught.code
          ? FIELD_OF_CODE[caught.code]
          : undefined;
      if (field) setErrors({ [field]: getErrorMessage(caught) });
      else setFormError(getErrorMessage(caught));
    } finally {
      setSaving(false);
      onBusyChange(false);
    }
  }

  return (
    <form className="add-municipality" onSubmit={handleSubmit} noValidate>
      {/* The dialog's first field: showModal() puts focus on it. */}
      <Input
        label="Nombre"
        value={name}
        error={errors.name}
        autoComplete="off"
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        label="Departamento"
        value={state}
        error={errors.state}
        autoComplete="off"
        onChange={(event) => setState(event.target.value)}
      />
      <Input
        label="Código DANE"
        value={daneCode}
        error={errors.daneCode}
        inputMode="numeric"
        maxLength={DANE_CODE_LENGTH}
        autoComplete="off"
        className="add-municipality__code"
        onChange={(event) => setDaneCode(event.target.value)}
      />
      <Input
        label="Identificador"
        value={slug}
        error={errors.slug}
        hint="Va en las direcciones del panel y de la consulta pública. No se puede cambiar cuando el municipio tenga datos."
        maxLength={MAX_SLUG_LENGTH}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        onChange={(event) => setCustomSlug(event.target.value)}
      />
      {formError && <Notice>{formError}</Notice>}
      <div className="ui-dialog__actions">
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button type="submit" loading={saving}>
          Agregar municipio
        </Button>
      </div>
    </form>
  );
}
