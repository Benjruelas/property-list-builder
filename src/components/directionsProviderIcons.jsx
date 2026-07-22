const ICON_WRAP = 'flex-shrink-0 h-5 w-5 flex items-center justify-center'

export function GoogleMapsIcon({ className = 'h-4 w-4' }) {
  return (
    <span className={ICON_WRAP}>
      <svg viewBox="0 0 48 48" className={className} aria-hidden>
        <path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.1 24.1 0 0 0 0 21.56l7.98-6.19z" />
        <path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    </span>
  )
}

export function AppleMapsIcon({ className = 'h-[18px] w-[18px]' }) {
  return (
    <span className={ICON_WRAP}>
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
        <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.52-3.23 0-1.44.62-2.2.44-3.06-.4C3.79 16.17 4.36 9.02 8.7 8.76c1.26.07 2.13.72 2.91.77.99-.2 1.95-.77 3.01-.7 1.28.1 2.24.6 2.86 1.54-2.63 1.58-2 5.07.37 6.04-.45 1.18-.99 2.36-1.8 3.87zM12.03 8.7c-.1-2.35 1.87-4.37 4.07-4.57.31 2.64-2.36 4.63-4.07 4.57z" />
      </svg>
    </span>
  )
}
