import { useId } from 'react';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  legend: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
}

/** A radio group styled as a segmented button row; arrow keys move between options. */
export function SegmentedControl<T extends string>({
  legend,
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  const name = useId();
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
        {options.map((o) => (
          <label key={o.value} className="relative">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-md px-3 text-sm font-medium text-slate-600 transition peer-checked:bg-white peer-checked:text-slate-900 peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500 md:min-h-8 dark:text-slate-300 dark:peer-checked:bg-slate-950 dark:peer-checked:text-white">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
