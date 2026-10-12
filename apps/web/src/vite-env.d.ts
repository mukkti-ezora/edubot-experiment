/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional demo sign-in passwords; the login page's demo panel shows only when set. */
  readonly VITE_DEMO_ADMIN_PASSWORD?: string;
  readonly VITE_DEMO_ROLE_PASSWORD?: string;
}
