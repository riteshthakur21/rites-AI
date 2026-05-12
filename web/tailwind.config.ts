import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "neo-bg": "#07070f",
        "neo-card": "#0c0c18",
        "neo-border": "#151528",
        "neo-accent": "#6c63ff",
        "neo-cyan": "#00d9ff"
      }
    }
  },
  plugins: []
} satisfies Config;
