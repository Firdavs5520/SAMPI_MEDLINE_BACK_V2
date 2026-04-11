/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#0E7490",
        "primary-dark": "#0B5E74",
        accent: "#F97316",
        surface: "#F8FAFC"
      },
      fontFamily: {
        golos: ['"Golos Text"', "sans-serif"]
      }
    }
  },
  plugins: []
};
