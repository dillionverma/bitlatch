import { screen, systemPreferences, type BrowserWindow, type Rectangle } from 'electron';
import type { VaultState } from '@latch/shared/types';

/** Compact authentication without losing the user's workspace position. */
export function manageWindowLayout(window: BrowserWindow) {
  let workspace = window.getBounds();
  let mode: 'workspace' | 'unlock' | 'signin' | undefined;
  let latest: VaultState;
  let deferred = false;

  function fit(bounds: Rectangle) {
    const area = screen.getDisplayMatching(bounds).workArea;
    const width = Math.min(bounds.width, area.width);
    const height = Math.min(bounds.height, area.height);
    return {
      width,
      height,
      x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
      y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    };
  }

  function update(state: VaultState, force = false) {
    if (window.isDestroyed()) return;
    latest = state;
    const next =
      state.status === 'unlocked' ? 'workspace' : state.status === 'locked' ? 'unlock' : 'signin';
    if (next === mode && !force) return;
    if (mode === 'workspace' && next !== 'workspace') workspace = window.getNormalBounds();
    let animate = false;
    if (mode && mode !== 'workspace' && next === 'workspace' && process.platform === 'darwin') {
      try {
        animate = !systemPreferences.getAnimationSettings().prefersReducedMotion;
      } catch {
        // Prefer no motion if the system preference cannot be read.
      }
    }
    mode = next;
    // Raising the minimum first would jump to 820×550 before the animation.
    if (!animate) applyMinimum();
    // Keep the user's full-screen or zoomed arrangement. Apply after they leave it.
    if (window.isFullScreen() || window.isMaximized()) {
      deferred = true;
      applyMinimum();
      return;
    }
    deferred = false;
    if (next === 'workspace') {
      const target = fit(workspace);
      const current = window.getBounds();
      const changed = Object.entries(target).some(
        ([key, value]) => current[key as keyof Rectangle] !== value,
      );
      window.setBounds(target, animate && changed);
      if (!animate || !changed) applyMinimum();
    } else {
      const current = window.getBounds();
      const width = next === 'unlock' ? 420 : 440;
      const height = next === 'unlock' ? 380 : 580;
      window.setBounds(
        fit({
          width,
          height,
          x: Math.round(current.x + (current.width - width) / 2),
          y: Math.round(current.y + (current.height - height) / 2),
        }),
      );
    }
  }
  function applyMinimum() {
    if (!window.isDestroyed())
      window.setMinimumSize(mode === 'workspace' ? 820 : 380, mode === 'workspace' ? 550 : 340);
  }
  // macOS emits this once the native setBounds animation finishes.
  window.on('resized', applyMinimum);
  const restore = () => {
    if (latest && deferred) update(latest, true);
  };
  window.on('leave-full-screen', restore);
  window.on('unmaximize', restore);
  return update;
}
