import { useRef, useState, type FormEvent } from 'react';
import type { Folder } from '@latch/shared/types';
import type { Notifier } from './Toasts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Names a new folder, or renames `folder`. */
export function FolderDialog({
  folder,
  onClose,
  onSaved,
  notify,
}: {
  folder: Folder | null;
  onClose: () => void;
  onSaved: (folder: Folder) => void;
  notify: Notifier;
}) {
  const [name, setName] = useState(folder?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const working = useRef(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (working.current || !name.trim()) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await window.latch.saveFolder(folder?.id ?? null, name.trim());
      if (result.ok) {
        notify.show('done', folder ? 'Folder renamed' : 'Folder created');
        onSaved(result.value);
        return;
      }
      setError(result.error);
    } catch {
      setError('Could not save the folder. Try again.');
    }
    working.current = false;
    setBusy(false);
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="task-dialog folder-dialog">
        <DialogHeader className="task-header">
          <DialogTitle>{folder ? 'Rename folder' : 'New folder'}</DialogTitle>
          <DialogDescription>Folders sync to every Bitwarden app.</DialogDescription>
        </DialogHeader>
        <form className="task-form" onSubmit={(event) => void save(event)} aria-busy={busy}>
          <div className="task-body">
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="folder-name">Name</FieldLabel>
              <Input
                id="folder-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={1_000}
                autoFocus
                disabled={busy}
                aria-invalid={!!error}
                aria-describedby={error ? 'folder-error' : undefined}
              />
              {error && <FieldError id="folder-error">{error}</FieldError>}
            </Field>
          </div>
          <DialogFooter className="task-footer">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()} aria-busy={busy}>
              {busy && <Spinner />}
              {folder ? 'Rename' : 'Create folder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
