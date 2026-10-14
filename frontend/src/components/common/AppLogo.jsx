import React from 'react';

/**
 * Odysseus / ScholarsMate Voyage Sailboat Logo
 * Inspired by the Greek Odyssey naval voyage — sleek, minimalist, and dynamic.
 */
export default function AppLogo({ className = "h-5 w-5", ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* Main Billowing Sail */}
      <path
        d="M11 2.5C11 2.5 10.3 8.5 5 14.2C4.7 14.5 5 15 5.4 15H11V2.5Z"
        fill="currentColor"
      />
      {/* Jib / Fore Sail */}
      <path
        d="M12.8 5.4C13.4 8.5 15.5 12.5 18.6 14.4C19 14.6 18.8 15 18.4 15H12.8V5.4Z"
        fill="currentColor"
        opacity="0.85"
      />
      {/* Sleek Wave-Carving Vessel Hull */}
      <path
        d="M3.2 17.2C6.8 20 17.2 20 20.8 17.2C18.2 20.8 5.8 20.8 3.2 17.2Z"
        fill="currentColor"
      />
    </svg>
  );
}
