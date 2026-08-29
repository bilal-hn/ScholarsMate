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
    id: "blaze",
    shortId: "blaze",
    name: "Blaze",
    mode: "animated",
    canvasPreview: "#090404",
    surfacePreview: "#1b0c0c",
    accentColor: "#ef4444",
    accentHover: "#f87171",
    description: "Deep carbon black canvas with fiery crimson accents and rising ember particles.",
  },
  {
    id: "aurora",
    shortId: "aurora",
    name: "Aurora",
    mode: "animated",
    canvasPreview: "#080911",
    surfacePreview: "#17192d",
    accentColor: "#818cf8",
    accentHover: "#a5b4fc",
    description: "Deep celestial space with cyan accents and gentle drifting starlight.",
  },
  {
    id: "original",
    shortId: "original",
    name: "Original",
    mode: "dark",
    canvasPreview: "#131417",
    surfacePreview: "#23252c",
    accentColor: "#e05d65",
    accentHover: "#f87171",
    description: "Signature matte obsidian canvas with salmon & coral accents.",
  },
  {
    id: "light",
    shortId: "light",
    name: "Light",
    mode: "light",
    canvasPreview: "#ffffff",
    surfacePreview: "#f3f4f6",
    accentColor: "#e05d65",
    accentHover: "#f87171",
    description: "Clean crisp light canvas with coral accents.",
  },
  {
    id: "midnight",
    shortId: "midnight",
    name: "Midnight",
    mode: "dark",
    canvasPreview: "#131314",
    surfacePreview: "#282a2c",
    accentColor: "#ef4444",
    accentHover: "#f87171",
    description: "Deep slate surfaces with vivid red accents.",
  },
  {
    id: "paper",
    shortId: "paper",
    name: "Paper",
    mode: "light",
    canvasPreview: "#ffffff",
    surfacePreview: "#f8fafc",
    accentColor: "#eab308",
    accentHover: "#ca8a04",
    description: "Bright publication paper with warm gold accents.",
  },
  {
    id: "cyberpunk",
    shortId: "cyberpunk",
    name: "Cyberpunk",
    mode: "dark",
    canvasPreview: "#120824",
    surfacePreview: "#22103f",
    accentColor: "#d946ef",
    accentHover: "#f472b6",
    description: "Neon night city synthwave palette with fuchsia accents.",
  },
  {
    id: "retrowave",
    shortId: "retrowave",
    name: "Retrowave",
    mode: "dark",
    canvasPreview: "#140924",
    surfacePreview: "#261042",
    accentColor: "#f43f5e",
    accentHover: "#fb7185",
    description: "80s sunset retrowave gradient with rose neon accents.",
  },
  {
    id: "forest",
    shortId: "forest",
    name: "Forest",
    mode: "dark",
    canvasPreview: "#0b140e",
    surfacePreview: "#14261b",
    accentColor: "#22c55e",
    accentHover: "#4ade80",
    description: "Deep evergreen woodland canvas with emerald green accents.",
  },
  {
    id: "ocean",
    shortId: "ocean",
    name: "Ocean",
    mode: "dark",
    canvasPreview: "#08131d",
    surfacePreview: "#0f2233",
    accentColor: "#0ea5e9",
    accentHover: "#38bdf8",
    description: "Deep oceanic abyss with vivid cyan highlights.",
  },
  {
    id: "ume",
    shortId: "ume",
    name: "Ume",
    mode: "dark",
    canvasPreview: "#140a12",
    surfacePreview: "#261121",
    accentColor: "#ec4899",
    accentHover: "#f472b6",
    description: "Japanese plum blossom dark aesthetic with magenta accents.",
  },
  {
    id: "copper",
    shortId: "copper",
    name: "Copper",
    mode: "dark",
    canvasPreview: "#140c08",
    surfacePreview: "#26160f",
    accentColor: "#f97316",
    accentHover: "#fb923c",
    description: "Smoked mahogany with glowing copper amber accents.",
  },
  {
    id: "terminal",
    shortId: "terminal",
    name: "Terminal",
    mode: "dark",
    canvasPreview: "#060d08",
    surfacePreview: "#0c1a10",
    accentColor: "#22c55e",
    accentHover: "#4ade80",
    description: "Monochrome hacker matrix terminal with phosphor green.",
  },
  {
    id: "origins",
    shortId: "origins",
    name: "Origins",
    mode: "dark",
    canvasPreview: "#121214",
    surfacePreview: "#1d1e22",
    accentColor: "#e2b36f",
    accentHover: "#f1c784",
    description: "Classic titanium slate with warm desert gold accents.",
  },
  {
    id: "lavender",
    shortId: "lavender",
    name: "Lavender",
    mode: "dark",
    canvasPreview: "#100d18",
    surfacePreview: "#1e192c",
    accentColor: "#a855f7",
    accentHover: "#c084fc",
    description: "Soft dusk violet with bright lavender highlights.",
  },
  {
    id: "gpt",
    shortId: "gpt",
    name: "GPT",
    mode: "dark",
    canvasPreview: "#212121",
    surfacePreview: "#2f2f2f",
    accentColor: "#10a37f",
    accentHover: "#34d399",
    description: "OpenAI charcoal background with emerald teal accents.",
  },
  {
    id: "claude",
    shortId: "claude",
    name: "Claude",
    mode: "dark",
    canvasPreview: "#1d1c1a",
    surfacePreview: "#262522",
    accentColor: "#cc785c",
    accentHover: "#e5957d",
    description: "Anthropic dark walnut paper with warm terracotta highlights.",
  },
  {
    id: "cute",
    shortId: "cute",
    name: "Cute",
    mode: "light",
    canvasPreview: "#ffffff",
    surfacePreview: "#fdf2f4",
    accentColor: "#ec4899",
    accentHover: "#f472b6",
    description: "Pastel blush cream with bright pink accents.",
  },
];

export const getSavedTheme = () => {
  try {
    const saved = localStorage.getItem("scholarsmate_theme");
    if (saved === 'odysseus') return 'original';
    if (saved === 'gemini') return 'midnight';
    if (saved === 'chatgpt') return 'gpt';
    if (saved === 'discord') return 'lavender';
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