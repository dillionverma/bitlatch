import { nativeTheme, systemPreferences } from 'electron';
import type { WindowAppearance } from '@latch/shared/types';

/** Resolve semantic NSColors in the main process, never in the web renderer. */
export function systemColors(): WindowAppearance['colors'] {
  if (process.platform !== 'darwin') return {};
  try {
    const color = (name: Parameters<typeof systemPreferences.getColor>[0]) =>
      hex(systemPreferences.getColor(name));
    const primary = hex(systemPreferences.getAccentColor());
    const window = color('window-background');
    // NSColor can still resolve the OS palette while Electron's appearance is
    // overridden or changing. Keep the matching CSS palette until they agree.
    if (luminance(window) < 0.5 !== nativeTheme.shouldUseDarkColors) {
      return {
        primary,
        'primary-foreground': contrastText(primary),
      };
    }
    const selection = color('unemphasized-selected-content-background');
    return {
      background: color('control-background'),
      foreground: color('label'),
      window,
      card: color('control-background'),
      'card-foreground': color('label'),
      popover: color('window-background'),
      'popover-foreground': color('label'),
      primary,
      'primary-foreground': contrastText(primary),
      secondary: color('control'),
      'secondary-foreground': color('control-text'),
      muted: color('control'),
      'muted-foreground': color('secondary-label'),
      border: color(nativeTheme.shouldUseHighContrastColors ? 'label' : 'separator'),
      input: color(nativeTheme.shouldUseHighContrastColors ? 'label' : 'separator'),
      ring: color('secondary-label'),
      selection,
      'selection-foreground': color('label'),
      'selection-inactive': selection,
      sidebar: color('window-background'),
      'sidebar-foreground': color('label'),
      'sidebar-accent': selection,
      'sidebar-accent-foreground': color('label'),
      'sidebar-selection-inactive': selection,
      'sidebar-border': color('separator'),
      'sidebar-ring': color('secondary-label'),
    };
  } catch {
    // Static theme tokens remain available if an OS color cannot be resolved.
    return {};
  }
}

function hex(value: string) {
  value = value.replace(/^#/, '');
  if (!/^[\da-f]{6}([\da-f]{2})?$/i.test(value)) throw new Error('Invalid system color');
  return `#${value}`;
}

/** Yellow and other light user accents need dark labels. */
function contrastText(color: string) {
  return luminance(color) > 0.179 ? '#000000' : '#ffffff';
}

function luminance(color: string) {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
