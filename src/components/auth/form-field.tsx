import type { ComponentProps, ReactNode } from "react";

type FormFieldProps = ComponentProps<"input"> & {
  label: string;
  icon: ReactNode;
  error?: string;
};

// Text input styled with the Figma .field / .field-control classes.
export function FormField({ label, icon, error, id, ...inputProps }: FormFieldProps) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="field-control" aria-invalid={error ? true : undefined}>
        {icon}
        <input id={id} aria-invalid={error ? true : undefined} aria-describedby={errorId} {...inputProps} />
      </span>
      {error && (
        <span className="field-error" id={errorId}>
          {error}
        </span>
      )}
    </label>
  );
}
