/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Chameleon UI - Dynamic colors mapped to CSS variables extracted via indexation
        dominant: 'var(--color-dominant)',
        'dominant-light': 'var(--color-dominant-light)',
        'dominant-dark': 'var(--color-dominant-dark)',
        'on-dominant': 'var(--color-on-dominant)',
        'surface-primary': 'var(--color-surface-primary)',
        'surface-secondary': 'var(--color-surface-secondary)',
        'surface-elevated': 'var(--color-surface-elevated)',
        'surface-hover': 'var(--color-surface-hover)',
        'surface-active': 'var(--color-surface-active)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
        'text-accent': 'var(--color-text-accent)',
        'border-subtle': 'var(--color-border-subtle)',
        'border-default': 'var(--color-border-default)',
        'border-accent': 'var(--color-border-accent)',
        'badge-bg': 'var(--color-badge-bg)',
        'badge-text': 'var(--color-badge-text)',
      }
    },
  },
  plugins: [],
}
