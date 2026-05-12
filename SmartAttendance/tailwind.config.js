/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './App.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: { 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1' },
        teacher: { 500: '#14b8a6', 600: '#0d9488' },
        student: { 500: '#3b82f6', 600: '#2563eb' },
      },
    },
  },
  plugins: [],
};
