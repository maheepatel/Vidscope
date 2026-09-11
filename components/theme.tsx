'use client';
import {ThemeProvider as NextThemes, useTheme} from 'next-themes';
import {Sun, Moon, Monitor} from 'lucide-react';
import {useEffect, useState} from 'react';

export function ThemeProvider({children}: {children: React.ReactNode}) {
  return (
    <NextThemes attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}

const modes = [
  ['light', 'Light', Sun],
  ['dark', 'Dark', Moon],
  ['system', 'Match system', Monitor],
] as const;

export function ThemeToggle() {
  const {theme, setTheme} = useTheme();
  // The stored choice is unknown during SSR, so render the control unpressed until
  // mount rather than guessing and flipping on hydration.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      {modes.map(([value, label, Icon]) => (
        <button
          key={value}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={ready && theme === value}
          onClick={() => setTheme(value)}
        >
          <Icon size={15} />
        </button>
      ))}
    </div>
  );
}
