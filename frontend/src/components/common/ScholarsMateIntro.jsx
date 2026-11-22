import React, { useState, useRef } from 'react';

/**
 * ScholarsMate Signature Intro Animation
 * 
 * Features:
 * - Architectural pawn bottom rising from base
 * - Speech bubble head dropping and bouncing into place
 * - Tri-tone wordmark "ScholarsMate" sliding out in Fraunces serif
 * - Tagline "YOUR RESEARCH, CHECKMATED" fading in
 * - Click anywhere on the lockup to replay the animation
 */
export default function ScholarsMateIntro({ className = '', onComplete }) {
  const [isPlaying, setIsPlaying] = useState(true);
  const stageRef = useRef(null);

  const handleReplay = () => {
    setIsPlaying(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPlaying(true);
      });
    });
  };

  return (
    <div
      ref={stageRef}
      onClick={handleReplay}
      className={`sm-stage cursor-pointer select-none group ${isPlaying ? 'sm-play' : ''} ${className}`}
      title="Click to replay intro animation"
      role="banner"
    >
      <div className="sm-lockup flex items-center justify-center">
        <svg
          className="sm-pawn"
          viewBox="0 0 100 114"
          role="img"
          aria-label="ScholarsMate pawn mark"
        >
          {/* Pawn Pedestal & Body (rises from base) */}
          <g className="sm-bottom">
            <rect x="30" y="50" width="40" height="8" rx="4" fill="var(--pawn-fg, #F5F5F5)" />
            <path d="M38 58 C38 76 30 88 24 99 L76 99 C70 88 62 76 62 58 Z" fill="var(--pawn-fg, #F5F5F5)" />
            <rect x="17" y="99" width="66" height="12" rx="6" fill="var(--pawn-muted, #A3A3A3)" />
          </g>

          {/* Chat Bubble Head with 3 Cutout Lines (drops with bounce) */}
          <g className="sm-head">
            <path d="M32 37 L25 50 L45 41 Z" fill="var(--pawn-fg, #F5F5F5)" />
            <rect x="27" y="4" width="46" height="37" rx="17" fill="var(--pawn-fg, #F5F5F5)" />
            <rect x="38" y="15" width="24" height="4" rx="2" fill="var(--pawn-bg, #0B0B0B)" />
            <rect x="38" y="23" width="24" height="4" rx="2" fill="var(--pawn-bg, #0B0B0B)" />
            <rect x="38" y="31" width="14" height="4" rx="2" fill="var(--pawn-muted, #A3A3A3)" />
          </g>
        </svg>

        {/* Animated Fraunces Serif Wordmark */}
        <div className="sm-word text-zinc-100">
          <span className="sm-in">
            Scholars<span className="sm-mate">Mate</span>
          </span>
        </div>
      </div>

      {/* Signature Tagline */}
      <div className="sm-tag font-mono">
        Your research, checkmated
      </div>
    </div>
  );
}
