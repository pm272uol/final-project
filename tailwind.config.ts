import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#161813",
        paper: "#f3efe4",
        acid: "#d8ff52",
        rust: "#e4643c",
      },
      boxShadow: {
        hard: "5px 5px 0 #161813",
      },
    },
  },
  plugins: [],
};

export default config;
