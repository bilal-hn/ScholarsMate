import React from 'react';

const SIZE_MAP = {
  xs: 'w-4 h-[18px]',
  sm: 'w-6 h-[27px]',
  md: 'w-10 h-[45px]',
  lg: 'w-14 h-[63px]',
  xl: 'w-20 h-[90px]',
};

/**
 * ScholarsMate Chess Piece Animated Loader (Without Text)
 * 
 * Features:
 * - Exact vector geometry of the ScholarsMate pawn mark
 * - Signature dropping & bouncing chat bubble head
 * - Real-time thinking pulse across the 3 cutout chat lines
 * - Silky 60fps / 120fps looping CSS animation
 * - Responsive sizing and full light/dark theme adaptation
 */
export default function ChessPieceLoader({
  size = 'md',
  className = '',
  label = null,
  sublabel = null,
  loop = true,
}) {
  const sizeClass = SIZE_MAP[size] || size;

  return (
    <div className={`sm-pawn-loader flex flex-col items-center justify-center ${className}`}>
      <svg
        className={`${sizeClass} sm-pawn-svg`}
        viewBox="0 0 100 114"
        role="progressbar"
        aria-label="Loading..."
      >
        {/* Pawn Pedestal & Body */}
        <g className={loop ? 'sm-pawn-loader-bottom' : ''}>
          <rect x="30" y="50" width="40" height="8" rx="4" fill="var(--pawn-fg, #F5F5F5)" />
          <path d="M38 58 C38 76 30 88 24 99 L76 99 C70 88 62 76 62 58 Z" fill="var(--pawn-fg, #F5F5F5)" />
          <rect x="17" y="99" width="66" height="12" rx="6" fill="var(--pawn-muted, #A3A3A3)" />
        </g>

        {/* Chat Bubble Head with Thinking Pulse Lines */}
        <g className={loop ? 'sm-pawn-loader-head' : ''}>
          <path d="M32 37 L25 50 L45 41 Z" fill="var(--pawn-fg, #F5F5F5)" />
          <rect x="27" y="4" width="46" height="37" rx="17" fill="var(--pawn-fg, #F5F5F5)" />
          <rect
            x="38"
            y="15"
            width="24"
            height="4"
            rx="2"
            fill="var(--pawn-bg, #0B0B0B)"
            className={loop ? 'sm-pawn-loader-line1' : ''}
          />
          <rect
            x="38"
            y="23"
            width="24"
            height="4"
            rx="2"
            fill="var(--pawn-bg, #0B0B0B)"
            className={loop ? 'sm-pawn-loader-line2' : ''}
          />
          <rect
            x="38"
            y="31"
            width="14"
            height="4"
            rx="2"
            fill="var(--pawn-muted, #A3A3A3)"
            className={loop ? 'sm-pawn-loader-line3' : ''}
          />
        </g>
      </svg>

      {label && (
        <span className="text-xs font-semibold text-zinc-200 mt-2.5 tracking-tight text-center">
          {label}
        </span>
      )}
      {sublabel && (
        <span className="text-[11px] text-zinc-500 font-mono mt-0.5 text-center max-w-xs">
          {sublabel}
        </span>
      )}
    </div>
  );
}
