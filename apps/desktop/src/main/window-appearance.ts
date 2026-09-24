import {
  nativeTheme,
  systemPreferences,
  type BrowserWindow,
  type BrowserWindowConstructorOptions,
} from 'electron';
import { createRequire } from 'node:module';

import type { WindowAppearance, WindowMaterial } from '@latch/shared/types';
import { systemColors } from './system-colors';
type Addon = {
  addView(handle: Buffer, options?: { cornerRadius?: number; opaque?: boolean }): number;
};
export type AppearanceOptions = {
  // Enable only on OS builds with verified native loading and appearance updates.
  allowGlass?: boolean;
  override?: WindowMaterial | 'unavailable';
};

/** Main process only. One controller per native window, not per renderer load. */
export function prepareWindowAppearance(options: AppearanceOptions = {}) {
  let addon: Addon | undefined;
  let material: WindowMaterial = 'solid';
  let revision = 0;
  let attached = false;
  let observationFailed = false;
  let target: BrowserWindow | undefined;
  const listeners = new Set<(snapshot: WindowAppearance) => void>();
  const preferences = () => {
    try {
      return {
        dark: nativeTheme.shouldUseDarkColors,
        reducedTransparency: nativeTheme.prefersReducedTransparency,
        highContrast: nativeTheme.shouldUseHighContrastColors,
        reducedMotion:
          process.platform === 'darwin' || process.platform === 'win32'
            ? systemPreferences.getAnimationSettings().prefersReducedMotion
            : false,
      };
    } catch {
      return {
        dark: nativeTheme.shouldUseDarkColors,
        reducedTransparency: true,
        highContrast: true,
        reducedMotion: true,
      };
    }
  };
  const initial = preferences();
  if (process.platform === 'darwin' && options.override !== 'solid') {
    // Electron's built-in material is the default and the optional addon's fallback.
    material = 'vibrancy';
    if (options.override === 'vibrancy') material = 'vibrancy';
    else if (
      options.allowGlass &&
      // Electron reports this host as 27.0.0; macOS labels it 27.0.
      /^27\.0(?:\.0)?$/.test(process.getSystemVersion()) &&
      options.override !== 'unavailable'
    ) {
      try {
        // Deliberately do not call the addon's child-process-based version probe.
        const require = createRequire(__filename);
        const loaded = require('electron-liquid-glass');
        addon = loaded.default ?? loaded;
        if (typeof addon?.addView === 'function') material = 'glass';
      } catch {
        /* An optional appearance failure must not stop startup. */
      }
    }
  }
  // Keep the native view alive behind an opaque surface while accessibility
  // preferences require solid. This lets the same view return without reinsertion.
  let availableMaterial = material;
  if (initial.reducedTransparency || initial.highContrast) material = 'solid';
  const snapshot = (): WindowAppearance => ({
    revision,
    material,
    active: target?.isFocused() ?? false,
    colors: systemColors(),
    ...preferences(),
  });
  const publish = () => {
    revision += 1;
    const value = snapshot();
    for (const listener of listeners) listener(value);
  };
  const refresh = () => {
    const state = preferences();
    const nextMaterial =
      observationFailed || state.reducedTransparency || state.highContrast
        ? 'solid'
        : availableMaterial;
    if (
      availableMaterial === 'vibrancy' &&
      nextMaterial !== material &&
      target &&
      !target.isDestroyed()
    ) {
      try {
        target.setVibrancy(nextMaterial === 'vibrancy' ? 'sidebar' : null);
      } catch {
        availableMaterial = 'solid';
      }
    }
    material = availableMaterial === 'solid' ? 'solid' : nextMaterial;
    if (target && !target.isDestroyed()) {
      target.setBackgroundColor(
        material === 'solid'
          ? (systemColors()?.window?.slice(0, 7) ?? (state.dark ? '#202023' : '#F5F5F7'))
          : '#00000000',
      );
    }
    publish();
  };
  const windowOptions: BrowserWindowConstructorOptions = {
    transparent: availableMaterial !== 'solid',
    backgroundColor:
      material === 'solid'
        ? (systemColors()?.window?.slice(0, 7) ?? (initial.dark ? '#202023' : '#F5F5F7'))
        : '#00000000',
    ...(material === 'vibrancy' ? { vibrancy: 'sidebar', visualEffectState: 'followWindow' } : {}),
  };
  return {
    windowOptions,
    snapshot,
    subscribe(listener: (snapshot: WindowAppearance) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    attach(win: BrowserWindow) {
      if (attached) throw new Error('Appearance already attached');
      attached = true;
      target = win;
      if (availableMaterial === 'glass') {
        try {
          const id = addon?.addView(win.getNativeWindowHandle(), {
            cornerRadius: 0,
            opaque: false,
          });
          if (typeof id !== 'number' || !Number.isInteger(id) || id < 0)
            availableMaterial = 'solid';
        } catch {
          availableMaterial = 'solid';
        }
      }
      nativeTheme.on('updated', refresh);
      win.on('focus', refresh);
      win.on('blur', refresh);
      // Refresh accessibility state on return from app hiding too.
      win.on('show', refresh);
      let accessibilitySubscription: number | undefined;
      const colorSubscriptions: number[] = [];
      if (process.platform === 'darwin') {
        try {
          accessibilitySubscription = systemPreferences.subscribeWorkspaceNotification(
            'NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification',
            refresh,
          );
        } catch {
          observationFailed = true;
        }
        for (const notification of [
          'AppleColorPreferencesChangedNotification',
          'AppleAquaColorVariantChanged',
        ]) {
          try {
            colorSubscriptions.push(systemPreferences.subscribeNotification(notification, refresh));
          } catch {
            // Focus and nativeTheme updates also refresh the palette.
          }
        }
      }
      win.once('closed', () => {
        nativeTheme.removeListener('updated', refresh);
        for (const id of colorSubscriptions) {
          try {
            systemPreferences.unsubscribeNotification(id);
          } catch {
            /* Already removed. */
          }
        }
        if (accessibilitySubscription !== undefined) {
          try {
            systemPreferences.unsubscribeWorkspaceNotification(accessibilitySubscription);
          } catch {
            // Optional OS teardown must not interrupt renderer/listener cleanup.
          }
        }
        win.removeListener('focus', refresh);
        win.removeListener('blur', refresh);
        win.removeListener('show', refresh);
        listeners.clear();
        target = undefined;
      });
      refresh();
    },
  };
}
