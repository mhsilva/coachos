import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        teal: '#16323F',
        copper: '#B76E4D',
        // Overrides Tailwind's gray palette — we only need bg-gray = #ECECEC
        gray: '#ECECEC',
        surface: '#F4F4F2',
      },
      fontFamily: {
        syne: ['Syne', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
        jetbrains: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        card: '12px',
        btn: '9px',
      },
      boxShadow: {
        card: '0 1px 4px rgba(22,50,63,0.07)',
        btn: '0 2px 8px rgba(183,110,77,0.28)',
      },
    },
  },
  plugins: [],
} satisfies Config
