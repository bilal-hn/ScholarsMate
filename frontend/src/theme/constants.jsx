// src/theme/constants.jsx

export const APP_CONFIG = {
  name: "ScholarsMate",
  tagline: "Yours for the voyage of research.",
  welcomeMessage: "Hello! I'm ScholarsMate. Ask me questions about your uploaded research papers or type @ to tag a file.",
  apiBaseUrl: "http://127.0.0.1:8000/api",
};

export const BRAND_CONFIG = {
  name: "ScholarsMate",
  subtitle: "Yours for the voyage of research.",
  tagline: "Source-Locked Research Intelligence",
  logo: {
    icon: "Compass",
    primaryColor: "#e06c67",
  },
};

export const THEMES = [
  {
    id: "original",
    shortId: "original",
    name: "Original",
    mode: "dark",
    canvasPreview: "#292c33",
    surfacePreview: "#111216",
    accentColor: "#e06c67",
    accentHover: "#ea8282",
    description: "Signature Odysseus slate charcoal with coral terracotta accents.",
  },
  {
    id: "nexus",
    shortId: "nexus",
    name: "Nexus",
    mode: "dark",
    canvasPreview: "#212121",
    surfacePreview: "#171717",
    accentColor: "#10a37f",
    accentHover: "#34d399",
    description: "Deep carbon charcoal with OpenAI-inspired emerald teal.",
  },
  {
    id: "ocean",
    shortId: "ocean",
    name: "Ocean",
    mode: "dark",
    canvasPreview: "#1c232d",
    surfacePreview: "#10141a",
    accentColor: "#0ea5e9",
    accentHover: "#38bdf8",
    description: "Deep Nordic slate navy with electric sky azure accents.",
  },
  {
    id: "parchment",
    shortId: "parchment",
    name: "Parchment",
    mode: "light",
    canvasPreview: "#fbf8f2",
    surfacePreview: "#f1ede4",
    accentColor: "#943d14",
    accentHover: "#b44f1e",
    description: "Soothing archival manuscript paper with warm book ink and terracotta.",
  },
  {
    id: "clarity",
    shortId: "clarity",
    name: "Clarity",
    mode: "light",
    canvasPreview: "#f8f9fb",
    surfacePreview: "#eef1f5",
    accentColor: "#1d4ed8",
    accentHover: "#2563eb",
    description: "Clean daylight studio porcelain with slate graphite and royal sapphire.",
  },
];

export const getSavedTheme = () => {
  try {
    const saved = localStorage.getItem("scholarsmate_theme");
    if (saved === 'odysseus' || saved === 'midnight' || saved === 'blaze' || saved === 'crimson') return 'original';
    if (saved === 'gpt' || saved === 'chatgpt' || saved === 'emerald' || saved === 'forest' || saved === 'terminal') return 'nexus';
    if (saved === 'ocean' || saved === 'nordic') return 'ocean';
    if (saved === 'claude' || saved === 'copper' || saved === 'origins' || saved === 'solar' || saved === 'paper') return 'parchment';
    if (saved === 'light' || saved === 'cute' || saved === 'celestial' || saved === 'gemini' || saved === 'aurora') return 'clarity';
    return THEMES.some((t) => t.id === saved) ? saved : "original";
  } catch {
    return "original";
  }
};

export const saveTheme = (themeId) => {
  try {
    localStorage.setItem("scholarsmate_theme", themeId);
    document.documentElement.setAttribute("data-theme", themeId);
  } catch (e) {
    console.error("Failed to save theme:", e);
  }
};

export const THEME_COLORS = {
  bg: {
    primary: "bg-zinc-950",
    secondary: "bg-zinc-900",
    sidebar: "bg-zinc-900",
    hover: "hover:bg-zinc-800/70",
    accent: "bg-amber-500",
    accentHover: "hover:bg-amber-400",
  },
  border: {
    primary: "border-zinc-800",
    subtle: "border-zinc-800/60",
    accent: "border-amber-500/40",
  },
  text: {
    primary: "text-zinc-100",
    secondary: "text-zinc-400",
    muted: "text-zinc-500",
    accent: "text-amber-400",
  },
};