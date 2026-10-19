import React, { useId } from "react";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select: React.FC<SelectProps> = ({
  children,
  label,
  error,
  className = "",
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...props
}) => {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const describedBy = [ariaDescribedBy, error ? `${selectId}-error` : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="text-sm font-medium text-foreground"
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={describedBy || undefined}
        className={`w-full rounded-xl border bg-surface-muted px-4 py-2.5 text-foreground outline-none transition-all focus:border-brand-500 focus:bg-surface focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 ${
          error
            ? "border-danger-500 focus:border-danger-500 focus:ring-danger-500/20"
            : "border-border"
        } ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && (
        <span id={`${selectId}-error`} className="text-xs text-danger-600">
          {error}
        </span>
      )}
    </div>
  );
};
