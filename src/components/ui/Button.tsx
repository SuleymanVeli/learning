import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "success" | "outline";
  size?: "sm" | "md" | "lg";
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}) => {
  const baseStyles =
    "flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";

  const variants = {
    primary: "bg-brand-600 text-white shadow-md shadow-brand-100 hover:bg-brand-700",
    secondary: "bg-surface-muted text-foreground hover:bg-border",
    danger: "bg-danger-500 text-white shadow-md shadow-danger-100 hover:bg-danger-600",
    success: "bg-success-500 text-white shadow-md shadow-success-100 hover:bg-success-600",
    outline:
      "border-2 border-border bg-transparent text-foreground hover:border-brand-200 hover:bg-brand-50",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-5 py-2.5 text-base",
    lg: "px-7 py-3.5 text-lg",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
