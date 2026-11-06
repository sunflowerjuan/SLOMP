import { useSlidingIndicator } from "../../hooks/useSlidingIndicator";
import "./SegmentedControl.css";

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  name: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const activeIndex = options.findIndex((option) => option.value === value);
  const { containerRef, indicatorStyle, dragging, axis, bind } =
    useSlidingIndicator<HTMLDivElement>(activeIndex, (index) =>
      onChange(options[index].value),
    );

  return (
    <div
      ref={containerRef}
      className="ui-segmented"
      role="radiogroup"
      aria-label={label}
      data-axis={axis}
      data-dragging={dragging || undefined}
      {...bind}
    >
      {indicatorStyle && (
        <span
          className="ui-segmented__indicator"
          style={indicatorStyle}
          aria-hidden="true"
        />
      )}
      {options.map((option) => (
        <label
          key={option.value}
          data-slide-item
          className="ui-segmented__option"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
