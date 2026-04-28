/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string
  readonly VITE_GOOGLE_MAPS_KEY: string
  readonly VITE_APP_URL: string
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare namespace NodeJS {
  interface ProcessEnv {
    readonly GEMINI_API_KEY: string
    readonly [key: string]: string | undefined
  }
}

declare var process: {
  env: NodeJS.ProcessEnv
};
