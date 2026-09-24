import { showHUD, showToast, Toast } from '@raycast/api';
import { request } from './bridge';
export default async function LockVault() {
  try {
    await request({ type: 'lock' });
    await showHUD('Latch locked');
  } catch {
    await showToast({
      style: Toast.Style.Failure,
      title: 'Could not lock Latch',
      message: 'Open Latch and try again.',
    });
  }
}
