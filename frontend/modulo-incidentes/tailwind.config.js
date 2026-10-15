/** @type {import('tailwindcss').Config} */
import defaultTheme from "tailwindcss/defaultTheme";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Roboto va empaquetada (@fontsource-variable/roboto), igual que en Penpot.
        sans: ['"Roboto Variable"', "Roboto", ...defaultTheme.fontFamily.sans],
      },
      colors: {
        brand: {
          DEFAULT: "#2563EB",
          hover: "#1D4ED8",
        },
      },
    },
  },
  plugins: [],
};
