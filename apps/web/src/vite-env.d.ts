/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WebSocket server URL (the VITE_WS_URL rule — never hardcode a host).
   * Unset in tests → mock transport. */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
