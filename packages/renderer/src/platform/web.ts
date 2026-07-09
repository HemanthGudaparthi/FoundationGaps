/**
 * Web / browser fallback platform.
 * Used during development (npm run dev) before any native shell is present.
 * All storage uses localStorage; file access uses the browser File API.
 */

import type { Platform, FileMeta, DatabaseHandle } from "./index";

export class WebPlatform implements Platform {
  name: "web" = "web";

  async pickVideoFile(): Promise<FileMeta | null> {
    return pickFile("video/*,.mkv,.m4v");
  }

  async pickPdfFile(): Promise<FileMeta | null> {
    return pickFile("application/pdf");
  }

  async readTextFile(path: string): Promise<string> {
    throw new Error("readTextFile not available in browser — use pickFile instead");
  }

  async secureSet(key: string, value: string): Promise<void> {
    localStorage.setItem(`epibins:${key}`, value);
  }

  async secureGet(key: string): Promise<string | null> {
    return localStorage.getItem(`epibins:${key}`);
  }

  async secureDel(key: string): Promise<void> {
    localStorage.removeItem(`epibins:${key}`);
  }

  async openDatabase(_name: string): Promise<DatabaseHandle> {
    // In-memory store for browser dev — not persisted across reloads
    const rows: Map<string, unknown[]> = new Map();
    return {
      async execute(sql) { /* no-op for dev */ },
      async query<T>(): Promise<T[]> { return []; },
      async close() {},
    };
  }

  async shareText(filename: string, content: string): Promise<void> {
    const blob = new Blob([content], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

function pickFile(accept: string): Promise<FileMeta | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      resolve({ name: file.name, path: URL.createObjectURL(file), size: file.size });
    };
    input.click();
  });
}
