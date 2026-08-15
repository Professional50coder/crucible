import type { Config } from 'tailwindcss'

/**
 * Crucible's palette is deliberately near-monochrome, and neutral rather than
 * blue-black: the ground is #131414, a dark grey with no hue, so that the one
 * chromatic accent reads as signal instead of decoration.
 *
 * Colour is reserved for state — running, verified, at-risk, failed — and for
 * `phosphor`, the single interactive accent used on links, focus rings, and the
 * numbers that matter. Everything else is grey on grey, separated by hairlines.
 *
 * Contrast (against `panel`, the surface most text sits on):
 *   fg     #ECEDEA  ~15.4:1
 *   dim    #A6A8A2   ~7.2:1
 *   faint  #82847E   ~4.6:1   ← floor; nothing smaller or dimmer than this
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /** Page ground. Neutral dark grey — not black, not blue-black. */
        ink: '#131414',
        /** Recessed wells: inputs, code blocks, anything that reads as "inside". */
        sub: '#0d0e0e',
        /** Card surface — one step lighter than the ground, so cards lift. */
        panel: '#191a1a',
        /** Hover / secondary surface. */
        raised: '#202121',
        line: '#282a29',
        'line-bright': '#383a38',
        fg: '#ecedea',
        dim: '#a6a8a2',
        faint: '#82847e',
        phosphor: '#c8f050',
        'phosphor-dim': '#8fa83c',
        ok: '#4ade80',
        warn: '#fbbf24',
        danger: '#f87171',
        info: '#7dd3fc',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        // No webfont is loaded: the build must succeed offline, and a passport
        // that waits on a CDN is a passport that fails to verify. The stack is
        // ordered so a developer machine with a good mono uses it.
        mono: [
          'JetBrains Mono',
          'IBM Plex Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        // Hero display sizes, fluid so 360px and 2560px both get a sensible
        // measure without a breakpoint jump.
        display: ['clamp(2rem, 1.2rem + 3.4vw, 3.75rem)', { lineHeight: '1.06', letterSpacing: '-0.022em' }],
        title: ['clamp(1.5rem, 1.1rem + 1.6vw, 2.25rem)', { lineHeight: '1.14', letterSpacing: '-0.018em' }],
        readout: ['clamp(1.75rem, 1.2rem + 2.2vw, 2.75rem)', { lineHeight: '1' }],
      },
      letterSpacing: {
        widest2: '0.18em',
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        // The card radius. Soft enough to read as a surface, tight enough to
        // still read as an instrument panel.
        lg: '0.625rem',
        xl: '0.875rem',
      },
      spacing: {
        // Vertical rhythm anchors: section padding steps.
        section: '4.5rem',
        'section-lg': '7rem',
      },
      keyframes: {
        pulseline: {
          '0%, 100%': { opacity: '0.25' },
          '50%': { opacity: '1' },
        },
        sweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(300%)' },
        },
        fadeup: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        /** The command palette entering from its trigger. */
        popin: {
          from: { opacity: '0', transform: 'translateY(-6px) scale(0.985)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        /** A hairline that fills left-to-right — used once, on the seal. */
        drawline: {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
      },
      animation: {
        pulseline: 'pulseline 1.8s ease-in-out infinite',
        sweep: 'sweep 2.4s linear infinite',
        fadeup: 'fadeup 220ms ease-out both',
        popin: 'popin 160ms cubic-bezier(0.16, 1, 0.3, 1) both',
        drawline: 'drawline 600ms cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
}

export default config
