import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import "./SlompsimButton.css";

// Slompsim, the AI assistant that will suggest status changes for the
// liquidations (HU32). Shown so the Administrator knows it is coming; it does
// nothing yet.
export function SlompsimButton() {
  return (
    <Button variant="secondary" className="slompsim-button" disabled>
      <Icon box={24}>
        <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
        <path d="M18.5 16v4M16.5 18h4" />
      </Icon>
      Slompsim
      <span className="slompsim-button__soon">Próximamente</span>
    </Button>
  );
}
