import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        nav: "#181d2e", navhover: "#232a40", navactive: "#2b3550",
        primary: "#5b5bd6", accent: "#2d7ff9",
        page: "#f4f5f9", line: "#e7e9f0",
        ink: "#1a1d2b", ink2: "#5a6072", ink3: "#9aa0b0",
        ok: "#16a34a", warn: "#d98a00", danger: "#e5484d",
      },
    },
  },
  plugins: [],
};
export default config;
