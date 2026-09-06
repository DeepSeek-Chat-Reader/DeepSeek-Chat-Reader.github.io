/**
 * Theme handling: light / dark.
 * The choice is intentionally NOT persisted (user request): on every load the
 * theme derives from the OS preference, and it live-follows OS changes while
 * the page is open. A manual toggle only affects the current session.
 */
import { t } from '../i18n';

export type Theme = 'light' | 'dark';

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)');

export function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function systemTheme(): Theme {
  return prefersDark().matches ? 'dark' : 'light';
}

export function initTheme(): void {
  setTheme(systemTheme());
  // Follow the OS when it switches themes while the app is open.
  prefersDark().addEventListener('change', (e) => {
    setTheme(e.matches ? 'dark' : 'light');
  });
}

export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
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
