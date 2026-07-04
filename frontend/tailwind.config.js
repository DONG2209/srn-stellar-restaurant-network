/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        stellar: {
          primary: '#3E63DD',
          secondary: '#7C3AED',
          dark: '#1A1A2E',
          light: '#F8F9FA',
        },
      },
    },
  },
  plugins: [],
};
