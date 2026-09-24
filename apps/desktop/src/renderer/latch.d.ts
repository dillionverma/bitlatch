import type { LatchApi } from '@latch/shared/types';

declare global {
  interface Window {
    latch: LatchApi;
  }
}
