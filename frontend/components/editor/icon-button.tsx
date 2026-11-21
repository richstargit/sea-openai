"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function IconButton({ label, children, active, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode; active?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={active} {...props}
      className={`editor-icon-button ${active ? "is-active" : ""} ${className}`}>
      {children}
      <span role="tooltip" className="editor-tooltip">{label}</span>
    </button>
  );
}
