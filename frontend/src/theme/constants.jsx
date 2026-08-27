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
    primaryColor: "#e05d65",
  },
};

export const THEMES = [
  {
    id: "odysseus",
    name: "Odysseus",
    subtitle: "Obsidian & Coral",
    accentColor: "#e05d65",
    accentHover: "#f87171",
    dotColor: "bg-[#e05d65]",
    bgPreview: "bg-[#131417]",
    description: "Default matte obsidian canvas with signature salmon & coral accents.",
  },
  {
    id: "gemini",
    name: "Gemini",
    subtitle: "Slate & Deep Blue",
    accentColor: "#1a73e8",
    accentHover: "#7cacf8",
    dotColor: "bg-[#1a73e8]",
    bgPreview: "bg-[#131314]",
    description: "Google dark slate surfaces with electric blue & indigo accents.",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    subtitle: "Dark & Emerald",
    accentColor: "#10a37f",
    accentHover: "#34d399",
    dotColor: "bg-[#10a37f]",
    bgPreview: "bg-[#212121]",
    description: "OpenAI charcoal background with signature emerald teal accents.",
  },
  {
    id: "claude",
    name: "Claude",
    subtitle: "Walnut & Terracotta",
    accentColor: "#cc785c",
    accentHover: "#e5957d",
    dotColor: "bg-[#cc785c]",
    bgPreview: "bg-[#1d1c1a]",
    description: "Warm Anthropic dark walnut paper with warm terracotta highlights.",
  },
  {
    id: "discord",
    name: "Discord",
    subtitle: "Slate & Blurple",
    accentColor: "#5865f2",
    accentHover: "#818cf8",
    dotColor: "bg-[#5865f2]",
    bgPreview: "bg-[#1e1f22]",
    description: "Discord dark slate interface with signature blurple accents.",
  },
];

export const getSavedTheme = () => {
  try {
    const saved = localStorage.getItem("scholarsmate_theme");
    return THEMES.some((t) => t.id === saved) ? saved : "odysseus";
  } catch {
    return "odysseus";
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