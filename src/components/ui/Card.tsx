import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = "" }) => {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface p-6 shadow-sm transition-all hover:shadow-md ${className}`}
    >
      {children}
    </div>
  );
};
