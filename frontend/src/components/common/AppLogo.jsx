import React from 'react';

/**
 * ScholarsMate Chess Pawn AI Logo
 * Crowned with an AI chat bubble featuring cutout message lines,
 * an architectural pawn collar and flared body, and a signature grey base pedestal.
 *
 * Tagline: "YOUR RESEARCH, CHECKMATED."
 */
export default function AppLogo({ 
  className = "h-5 w-5", 
  baseColor = "var(--theme-logo-base, #8e8e93)",
  ...props 
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* Speech Bubble Head with Tail and 3 Cutout Chat Lines (EvenOdd) */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M 12 1.8 C 8.6 1.8 5.8 4.2 5.8 7.2 C 5.8 8.8 6.6 10.3 8.0 11.2 L 5.6 13.4 L 10.2 12.3 C 10.8 12.5 11.4 12.6 12 12.6 C 15.4 12.6 18.2 10.2 18.2 7.2 C 18.2 4.2 15.4 1.8 12 1.8 Z M 9.3 4.8 C 9.3 4.35 9.65 4.0 10.1 4.0 L 13.9 4.0 C 14.35 4.0 14.7 4.35 14.7 4.8 C 14.7 5.25 14.35 5.6 13.9 5.6 L 10.1 5.6 C 9.65 5.6 9.3 5.25 9.3 4.8 Z M 8.7 6.8 C 8.7 6.35 9.05 6.0 9.5 6.0 L 14.5 6.0 C 14.95 6.0 15.3 6.35 15.3 6.8 C 15.3 7.25 14.95 7.6 14.5 7.6 L 9.5 7.6 C 9.05 7.6 8.7 7.25 8.7 6.8 Z M 8.7 8.8 C 8.7 8.35 9.05 8.0 9.5 8.0 L 12.5 8.0 C 12.95 8.0 13.3 8.35 13.3 8.8 C 13.3 9.25 12.95 9.6 12.5 9.6 L 9.5 9.6 C 9.05 9.6 8.7 9.25 8.7 8.8 Z"
        fill="currentColor"
      />
      
      {/* Neck Collar */}
      <rect x="8.3" y="13.1" width="7.4" height="1.5" rx="0.75" fill="currentColor" />

      {/* Flared Pawn Body with concave curve */}
      <path
        d="M 9.5 14.4 L 14.5 14.4 C 14.6 16.0 15.6 17.7 17.2 19.3 L 6.8 19.3 C 8.4 17.7 9.4 16.0 9.5 14.4 Z"
        fill="currentColor"
      />

      {/* Base Pedestal (Signature Grey Accent from branding reference) */}
      <rect x="4.4" y="19.3" width="15.2" height="2.5" rx="1.25" fill={baseColor} />
    </svg>
  );
}
