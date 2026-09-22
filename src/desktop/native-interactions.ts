import { dialog, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { ItemDetail, ItemMenuAction, MenuPosition, NativeConfirmation } from '../shared/types';

export function installNativeInteractions(window: BrowserWindow) {
  let confirmation: AbortController | undefined;
  let dismissMenu: (() => void) | undefined;
  const cancelMenu = () => dismissMenu?.();
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
    cancelMenu();
    const menu = Menu.buildFromTemplate(template);
    const dismiss = () => {
      if (dismissMenu === dismiss) dismissMenu = undefined;
      if (!window.isDestroyed()) menu.closePopup(window);
    };
    dismissMenu = dismiss;
    menu.popup({
      window,
      frame: params.frame ?? undefined,
      callback: () => {
        if (dismissMenu === dismiss) dismissMenu = undefined;
      },
    });
  });
  const cancelConfirmation = () => confirmation?.abort();
  window.on('hide', cancelConfirmation);
  window.once('closed', cancelConfirmation);
  window.on('hide', cancelMenu);
  window.once('closed', cancelMenu);
  window.webContents.on('did-start-navigation', cancelMenu);
  return {
    cancelConfirmation,
    cancelMenu,
    itemMenu(item: ItemDetail, position: MenuPosition): Promise<ItemMenuAction | null> {
      cancelMenu();
      if (confirmation || window.isDestroyed() || !window.isVisible()) return Promise.resolve(null);
      return new Promise((resolve) => {
        let action: ItemMenuAction | null = null;
        const entry = (
          label: string,
          value: ItemMenuAction,
          enabled = true,
        ): MenuItemConstructorOptions => ({
          label,
          enabled,
          click: () => {
            action = value;
          },
        });
        const template: MenuItemConstructorOptions[] = [];
        if (item.type === 1) {
          template.push(entry('Copy Username', 'copyUsername', !!item.username));
          template.push(entry('Copy Password', 'copyPassword', !!item.password));
          template.push({ type: 'separator' });
        }
        template.push(entry('Edit', 'edit', item.editable));
        if (item.restorable) template.push(entry('Restore to Vault', 'restore'));
        else template.push(entry('Move to Trash…', 'trash', item.deletable));
        const menu = Menu.buildFromTemplate(template);
        const dismiss = () => {
          if (dismissMenu === dismiss) dismissMenu = undefined;
          resolve(null);
          if (!window.isDestroyed()) menu.closePopup(window);
        };
        dismissMenu = dismiss;
        const [width = 1, height = 1] = window.getContentSize();
        menu.popup({
          window,
          x: Math.min(position.x, width - 1),
          y: Math.min(position.y, height - 1),
          callback: () => {
            if (dismissMenu === dismiss) dismissMenu = undefined;
            resolve(action);
          },
        });
      });
    },
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
