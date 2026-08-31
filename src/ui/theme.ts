/** Theme handling: light / dark, follows system preference initially. */
import { t } from '../i18n';

export type Theme = 'light' | 'dark';

export function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function initTheme(): void {
  const saved = localStorage.getItem('dscr-theme') as Theme | null;
  const theme: Theme =
    saved === 'dark' || saved === 'light'
      ? saved
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  setTheme(theme);
}

export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('dscr-theme', theme);
  updateThemeButton();
}

export function toggleTheme(): void {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

export function updateThemeButton(): void {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  const icon = btn.querySelector('i');
  const label = btn.querySelector('span');
  const dark = currentTheme() === 'dark';
  if (icon) icon.className = dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  if (label) label.textContent = dark ? t('lightMode') : t('darkMode');
}
