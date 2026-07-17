/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-navy': '#010624',
        'brand-blue': '#2B46CC',
        'brand-melon': '#F6714F',
        'brand-sun': '#FFB448',
        emerald: {
          500: '#10b981',
          600: '#059669',
        },
        slate: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        }
      },
      borderRadius: {
        'none': '0',
        DEFAULT: '0',
        'md': '2px',
      }
    },
  },
  plugins: [],
}
