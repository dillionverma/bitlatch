import { showHUD, showToast, Toast } from '@raycast/api';
import { request } from './bridge';
export default async function LockVault() {
  try {
    await request({ type: 'lock' });
    await showHUD('Bitlatch locked');
  } catch {
    await showToast({
      style: Toast.Style.Failure,
      title: 'Could not lock Bitlatch',
      message: 'Open Bitlatch and try again.',
    });
  }
}
