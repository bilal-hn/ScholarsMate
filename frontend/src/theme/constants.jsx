// src/theme/constants.jsx

export const APP_CONFIG = {
  name: "ScholarsMate",
  tagline: "YOUR RESEARCH, CHECKMATED.",
  welcomeMessage: "Hello! I'm ScholarsMate. Ask me questions about your uploaded research papers or type @ to tag a file.",
  apiBaseUrl: "http://127.0.0.1:8000/api",
};

export const BRAND_CONFIG = {
  name: "ScholarsMate",
  subtitle: "YOUR RESEARCH, CHECKMATED.",
  tagline: "YOUR RESEARCH, CHECKMATED.",
  logo: {
    icon: "ChessPawn",
    primaryColor: "#ffffff",
    baseColor: "#8e8e93",
  },
};

export const THEMES = [
  {
    id: "original",
    shortId: "original",
    name: "Dark",
    mode: "dark",
    canvasPreview: "#09090b",
    surfacePreview: "#121215",
    accentColor: "#ffffff",
    accentHover: "#8e8e93",
    description: "Sleek, sharp obsidian dark mode with signature slate grey accents.",
  },
  {
    id: "clarity",
    shortId: "clarity",
    name: "Light",
    mode: "light",
    canvasPreview: "#ffffff",
    surfacePreview: "#f4f4f5",
    accentColor: "#09090b",
    accentHover: "#8e8e93",
    description: "Clean daylight studio porcelain with sharp black ink and grey accents.",
  },
];

export const getSavedTheme = () => {
  try {
    const saved = localStorage.getItem("scholarsmate_theme");
    if (saved === 'clarity' || saved === 'light' || saved === 'parchment' || saved === 'paper') {
      return 'clarity';
    }
    return 'original';
  } catch {
    return 'original';
  }
};

export const saveTheme = (themeId) => {
  try {
    const canonical = themeId === 'clarity' ? 'clarity' : 'original';
    localStorage.setItem("scholarsmate_theme", canonical);
    document.documentElement.setAttribute("data-theme", canonical);
  } catch (e) {
    console.error("Failed to save theme:", e);
  }
};

export const toggleTheme = (currentTheme) => {
  return currentTheme === 'clarity' ? 'original' : 'clarity';
};
