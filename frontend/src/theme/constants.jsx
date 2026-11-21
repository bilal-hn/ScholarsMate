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
    icon: "Sailboat",
    primaryColor: "#f4f4f5",
  },
};

export const THEMES = [
  {
    id: "original",
    shortId: "original",
    name: "Dark",
    mode: "dark",
    canvasPreview: "#101114",
    surfacePreview: "#18191d",
    accentColor: "#f4f4f5",
    accentHover: "#ffffff",
    description: "Sleek, distraction-free minimalist dark mode with zero red tones.",
  },
  {
    id: "clarity",
    shortId: "clarity",
    name: "Light",
    mode: "light",
    canvasPreview: "#ffffff",
    surfacePreview: "#f8f9fa",
    accentColor: "#18181b",
    accentHover: "#27272a",
    description: "Clean daylight studio porcelain with neutral charcoal ink.",
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
