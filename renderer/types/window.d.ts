import type { PaToolsApi } from '../../shared/api';

declare global {
  interface Window {
    api: PaToolsApi;
  }
}

export {};
