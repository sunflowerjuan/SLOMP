import "./Steps.css";

interface StepsProps {
  // Names the list for screen readers, e.g. "Pasos para generar mandamientos".
  label: string;
  steps: string[];
  // Index of the current step.
  current: number;
}

// Where a multi-step flow is. On a phone it reads "Paso 2 de 3: Revisar";
// screen readers always get the full list, with the current step marked.
export function Steps({ label, steps, current }: StepsProps) {
  return (
    <div className="ui-steps">
      <ol className="ui-steps__list" aria-label={label}>
        {steps.map((step, index) => (
          <li
            key={step}
            data-state={
              index < current ? "done" : index === current ? "current" : "todo"
            }
            aria-current={index === current ? "step" : undefined}
          >
            <span className="ui-steps__number" aria-hidden="true">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <p className="ui-steps__compact" aria-hidden="true">
        Paso {current + 1} de {steps.length}: <strong>{steps[current]}</strong>
      </p>
    </div>
  );
}
