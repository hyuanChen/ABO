import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        abo: {
          bg: 'var(--bg)',
          surface: 'var(--surface)',
          'surface-2': 'var(--surface-2)',
          border: 'var(--border)',
          text: 'var(--text)',
          muted: 'var(--text-muted)',
          primary: 'var(--primary)',
          'primary-dim': 'var(--primary-dim)',
          cta: 'var(--cta)',
          xp: 'var(--xp)',
          danger: 'var(--danger)',
        }
      },
      fontFamily: {
        heading: ['Crimson Pro', 'Georgia', 'serif'],
        body: ['Atkinson Hyperlegible', 'sans-serif'],
      },
      keyframes: {
        wiggle: {
          "0%, 100%": { transform: "translateX(0px)" },
          "25%": { transform: "translateX(-2px)" },
          "75%": { transform: "translateX(2px)" },
        },
      },
      animation: {
        wiggle: "wiggle 0.3s ease-in-out infinite",
      },
    }
  },
  plugins: [],
} satisfies Config
