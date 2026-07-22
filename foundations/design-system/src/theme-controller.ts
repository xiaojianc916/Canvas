export type ThemePreference = 'light' | 'dark' | 'system'

const DARK_QUERY = '(prefers-color-scheme: dark)'

let removeSystemListener: (() => void) | undefined

export function applyThemePreference(theme: ThemePreference): void {
  removeSystemListener?.()
  removeSystemListener = undefined

  const root = document.documentElement

  const apply = (dark: boolean) => {
    root.setAttribute('data-theme', dark ? 'dark' : 'light')
  }

  if (theme === 'light' || theme === 'dark') {
    apply(theme === 'dark')
    return
  }

  const query = window.matchMedia(DARK_QUERY)
  const synchronize = () => apply(query.matches)

  query.addEventListener('change', synchronize)

  removeSystemListener = () => {
    query.removeEventListener('change', synchronize)
  }

  synchronize()
}
