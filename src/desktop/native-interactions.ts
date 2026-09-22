import { dialog, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { NativeConfirmation } from '../shared/types';

export function installNativeInteractions(window: BrowserWindow) {
  let confirmation: AbortController | undefined;
  window.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable && !params.selectionText) return;
    const { editFlags } = params;
    const secret = params.formControlType === 'input-password';
    const template: MenuItemConstructorOptions[] = params.isEditable
      ? [
          { role: 'undo', enabled: editFlags.canUndo },
          { role: 'redo', enabled: editFlags.canRedo },
          { type: 'separator' },
          { role: 'cut', enabled: !secret && editFlags.canCut },
          { role: 'copy', enabled: !secret && editFlags.canCopy },
          { role: 'paste', enabled: editFlags.canPaste },
          { type: 'separator' },
          { role: 'selectAll', enabled: editFlags.canSelectAll },
        ]
      : [{ role: 'copy', enabled: editFlags.canCopy }];
    Menu.buildFromTemplate(template).popup({ window, frame: params.frame ?? undefined });
  });
  const cancelConfirmation = () => confirmation?.abort();
  window.on('hide', cancelConfirmation);
  window.once('closed', cancelConfirmation);
  return {
    cancelConfirmation,
    async confirm(action: NativeConfirmation) {
      if (confirmation || window.isDestroyed() || !window.isVisible()) return false;
      const controller = new AbortController();
      confirmation = controller;
      try {
        const trash = action === 'trash';
        const result = await dialog.showMessageBox(window, {
          type: 'warning',
          message: trash ? 'Move this item to Trash?' : 'Discard changes?',
          detail: trash
            ? 'You can restore it from Trash. This does not delete it permanently.'
            : 'Your unsaved changes will be lost.',
          buttons: trash ? ['Cancel', 'Move to Trash'] : ['Keep editing', 'Discard changes'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
          signal: controller.signal,
        });
        return !controller.signal.aborted && result.response === 1;
      } finally {
        confirmation = undefined;
      }
    },
  };
}
