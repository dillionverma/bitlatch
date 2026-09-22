import {
  nativeTheme,
  systemPreferences,
  type BrowserWindow,
  type BrowserWindowConstructorOptions,
} from 'electron';
import { createRequire } from 'node:module';

import type { WindowAppearance, WindowMaterial } from '../shared/types';
type Addon = {
  addView(handle: Buffer, options?: { cornerRadius?: number; opaque?: boolean }): number;
};
export type AppearanceOptions = {
  // Caller must opt in only for OS builds it has verified. Default stays solid.
  allowGlass?: boolean;
  override?: WindowMaterial | 'unavailable';
};

/** Main process only. One controller per native window, not per renderer load. */
export function prepareWindowAppearance(options: AppearanceOptions = {}) {
  let addon: Addon | undefined;
  let material: WindowMaterial = 'solid';
  let revision = 0;
  let attached = false;
  let latchedSolid = false;
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
  const blocked = initial.reducedTransparency || initial.highContrast;
  if (process.platform === 'darwin' && !blocked && options.override !== 'solid') {
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
  const snapshot = (): WindowAppearance => ({
    revision,
    material,
    active: target?.isFocused() ?? false,
    ...preferences(),
  });
  const publish = () => {
    revision += 1;
    const value = snapshot();
    for (const listener of listeners) listener(value);
  };
  const refresh = () => {
    const state = preferences();
    if (state.reducedTransparency || state.highContrast) latchedSolid = true;
    if (latchedSolid) {
      // There is no supported addon teardown. Renderer MUST mask every surface.
      if (material === 'vibrancy' && target && !target.isDestroyed()) {
        try {
          target.setVibrancy(null);
        } catch {
          // The opaque native background and renderer still cover the effect.
        }
      }
      material = 'solid';
    }
    if (target && !target.isDestroyed()) {
      target.setBackgroundColor(
        material === 'solid' ? (state.dark ? '#202023' : '#F5F5F7') : '#00000000',
      );
    }
    publish();
  };
  const windowOptions: BrowserWindowConstructorOptions = {
    transparent: material !== 'solid',
    backgroundColor: material === 'solid' ? (initial.dark ? '#202023' : '#F5F5F7') : '#00000000',
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
      if (material === 'glass') {
        try {
          const id = addon?.addView(win.getNativeWindowHandle(), {
            cornerRadius: 0,
            opaque: false,
          });
          if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) material = 'solid';
        } catch {
          material = 'solid';
        }
      }
      nativeTheme.on('updated', refresh);
      win.on('focus', refresh);
      win.on('blur', refresh);
      // Refresh accessibility state on return from app hiding too.
      win.on('show', refresh);
      let accessibilitySubscription: number | undefined;
      if (process.platform === 'darwin') {
        try {
          accessibilitySubscription = systemPreferences.subscribeWorkspaceNotification(
            'NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification',
            refresh,
          );
        } catch {
          latchedSolid = true;
        }
      }
      win.once('closed', () => {
        nativeTheme.removeListener('updated', refresh);
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
