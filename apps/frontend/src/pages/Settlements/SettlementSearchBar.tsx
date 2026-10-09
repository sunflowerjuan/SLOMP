import { Icon } from "../../components/ui/Icon";
import type { FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import "./SettlementSearchBar.css";

export type SearchField = "cadastralCode" | "owner" | "address";

const FIELD_OPTIONS: { value: SearchField; label: string }[] = [
  { value: "cadastralCode", label: "Cédula" },
  { value: "owner", label: "Propietario" },
  { value: "address", label: "Dirección" },
];

const PLACEHOLDER: Record<SearchField, string> = {
  cadastralCode: "000-00-0000-000",
  owner: "Nombre del propietario",
  address: "Calle 00 # 00-00",
};

interface SettlementSearchBarProps {
  field: SearchField;
  query: string;
  isSearching: boolean;
  onFieldChange: (field: SearchField) => void;
  onQueryChange: (query: string) => void;
  onSubmit: () => void;
}

export function SettlementSearchBar({
  field,
  query,
  isSearching,
  onFieldChange,
  onQueryChange,
  onSubmit,
}: SettlementSearchBarProps) {
  const label = FIELD_OPTIONS.find((option) => option.value === field)!.label;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="settlement-search" role="search" onSubmit={handleSubmit}>
      <label className="settlement-search__field">
        <Icon>
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </Icon>
        <input
          type="search"
          aria-label={label}
          placeholder={PLACEHOLDER[field]}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>
      <SegmentedControl
        label="Buscar por"
        name="search-field"
        options={FIELD_OPTIONS}
        value={field}
        onChange={onFieldChange}
      />
      <Button type="submit" size="lg" loading={isSearching}>
        Buscar
      </Button>
    </form>
  );
}
