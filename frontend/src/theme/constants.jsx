// src/theme/constants.js

export const APP_CONFIG = {
  name: "ScholarsMate",
  tagline: "Source-Locked Research Intelligence",
  welcomeMessage: "Hello! I'm ScholarsMate. Ask me questions about your uploaded research papers.",
  apiBaseUrl: "http://127.0.0.1:8000/api",
};

export const BRAND_CONFIG = {
  name: "ScholarsMate",
  tagline: "Source-Locked Research Intelligence",
  logo: {
    icon: "GraduationCap", // Lucide icon reference
    primaryColor: "#f59e0b", // Amber-500
  },
};

export const THEME_COLORS = {
  bg: {
    primary: "bg-zinc-950",
    secondary: "bg-zinc-900",
    sidebar: "bg-zinc-900/90",
    hover: "hover:bg-zinc-800/60",
    accent: "bg-amber-500",
    accentHover: "hover:bg-amber-600",
  },
  border: {
    primary: "border-zinc-800",
    subtle: "border-zinc-800/60",
    accent: "border-amber-500/30",
  },
  text: {
    primary: "text-zinc-100",
    secondary: "text-zinc-400",
    muted: "text-zinc-500",
    accent: "text-amber-400",
  },
};