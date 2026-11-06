import { Icon } from "../ui/Icon";

// What the layout needs to let the super user switch municipality (SL-126).
export interface MunicipalitySwitch {
  options: { slug: string; label: string }[];
  activeSlug: string | null;
  activeLabel: string | null;
  onSelect: (slug: string) => void;
  onAdd: () => void;
}

interface MunicipalityOptionsProps {
  switcher: MunicipalitySwitch;
  // Closes the menu that holds the options.
  onDone: () => void;
}

// The municipalities, the active one checked, and "Agregar municipio" last.
export function MunicipalityOptions({
  switcher,
  onDone,
}: MunicipalityOptionsProps) {
  return (
    <>
      {switcher.options.map((option) => {
        const checked = option.slug === switcher.activeSlug;
        return (
          <button
            key={option.slug}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            className="admin-layout__menu-item admin-layout__option"
            onClick={() => {
              onDone();
              if (!checked) switcher.onSelect(option.slug);
            }}
          >
            <span className="admin-layout__check" aria-hidden="true">
              {checked && (
                <Icon box={24}>
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </Icon>
              )}
            </span>
            <span className="admin-layout__option-label">{option.label}</span>
          </button>
        );
      })}
      {switcher.options.length > 0 && (
        <div role="separator" className="admin-layout__menu-separator" />
      )}
      <button
        type="button"
        role="menuitem"
        className="admin-layout__menu-item"
        onClick={() => {
          onDone();
          switcher.onAdd();
        }}
      >
        <Icon box={24}>
          <path d="M12 5v14M5 12h14" />
        </Icon>
        Agregar municipio
      </button>
    </>
  );
}
