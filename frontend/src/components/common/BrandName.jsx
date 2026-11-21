import React from 'react';

/**
 * ScholarsMate Tri-Tone Brand Typography Component
 * Displays "Scholars" in sharp white (or black in light mode)
 * and "Mate" in signature slate grey (#8e8e93).
 *
 * Uses crisp, modern sans-serif by default for crystal-clear readability
 * at small UI scale (11px-14px) without distorted spindly serifs.
 */
export default function BrandName({ 
  className = "", 
  serif = false,
  scholarsClassName,
  mateClassName,
}) {
  const defaultScholars = serif 
    ? "font-serif font-bold text-zinc-950 dark:text-zinc-100 tracking-tight"
    : "font-sans font-bold text-zinc-950 dark:text-zinc-100 tracking-tight";
    
  const defaultMate = serif
    ? "font-serif font-bold text-[#8e8e93] tracking-tight"
    : "font-sans font-bold text-[#8e8e93] tracking-tight";

  return (
    <span className={`inline-flex items-baseline select-none ${className}`}>
      <span className={scholarsClassName || defaultScholars}>Scholars</span>
      <span className={mateClassName || defaultMate}>Mate</span>
    </span>
  );
}
