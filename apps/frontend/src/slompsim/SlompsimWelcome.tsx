import "./SlompsimWelcome.css";

const SUGGESTIONS = [
  "Muéstrame las liquidaciones de un predio",
  "¿A qué estados puede pasar una liquidación en firme?",
  "Marca como pagado un periodo de un predio",
];

interface SlompsimWelcomeProps {
  // A suggestion only writes the sentence: the code of the property is
  // still missing, so it is never sent by itself.
  onPick: (text: string) => void;
}

export function SlompsimWelcome({ onPick }: SlompsimWelcomeProps) {
  return (
    <div className="slompsim-welcome">
      <h3 className="slompsim-welcome__title">¿Qué necesitas revisar?</h3>
      <p className="slompsim-welcome__text">
        Busco liquidaciones, te explico las reglas de los estados y preparo
        cambios de estado. Nada cambia hasta que tú lo apliques.
      </p>
      <ul className="slompsim-welcome__suggestions" aria-label="Sugerencias">
        {SUGGESTIONS.map((suggestion) => (
          <li key={suggestion}>
            <button
              type="button"
              className="slompsim-welcome__suggestion"
              onClick={() => onPick(suggestion)}
            >
              {suggestion}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
