// Section typography system — the single source of truth.
// AWS-style discipline: every section on every page uses the SAME eyebrow
// treatment, the SAME title scale, the SAME rhythm. Import these; never
// hand-roll a section header again.

import React from "react";

/** Eyebrow: one style, one color, sitewide. */
export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-xs uppercase tracking-[3px] text-primary mb-3 ${className}`}>{children}</div>;
}

/** Section title (h2): one scale, sitewide. Heroes (h1) are the only exception. */
export function SectionTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tighter ${className}`}>{children}</h2>;
}

/** Full header block: eyebrow + title + optional subtitle, consistent spacing. */
export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "center",
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: "center" | "left";
}) {
  const centered = align === "center";
  return (
    <div className={`${centered ? "text-center" : "text-left"} mb-12`}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <SectionTitle>{title}</SectionTitle>
      {subtitle && (
        <p className={`mt-4 text-lg md:text-xl text-white/70 max-w-2xl ${centered ? "mx-auto" : ""}`}>{subtitle}</p>
      )}
    </div>
  );
}

/** Uniform card: identical padding, radius, border everywhere. h-full keeps grids symmetric. */
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass p-8 rounded-3xl border border-white/10 h-full ${className}`}>{children}</div>;
}
