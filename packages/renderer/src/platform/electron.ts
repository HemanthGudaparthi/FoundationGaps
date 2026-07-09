/**
 * Electron platform implementation (Windows + Mac desktop).
 *
 * Communicates with the Electron main process via window.electronAPI,
 * which is exposed through contextBridge in preload.js.
 */

import type { Platform, FileMeta, DatabaseHandle } from "./index";

const api = () => (window as any).electronAPI;

export class ElectronPlatform implements Platform {
  name: "electron" = "electron";

  async pickVideoFile(): Promise<FileMeta | null> {
    return api().invoke("dialog:pickFile", {
      filters: [{ name: "Videos", extensions: ["mp4", "mkv", "mov", "m4v", "avi", "webm"] }],
    });
  }

  async pickPdfFile(): Promise<FileMeta | null> {
    return api().invoke("dialog:pickFile", {
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
  }

  async readTextFile(path: string): Promise<string> {
    return api().invoke("fs:readText", { path });
  }

  async secureSet(key: string, value: string): Promise<void> {
    return api().invoke("keychain:set", { key, value });
  }

  async secureGet(key: string): Promise<string | null> {
    return api().invoke("keychain:get", { key });
  }

  async secureDel(key: string): Promise<void> {
    return api().invoke("keychain:del", { key });
  }

  async openDatabase(name: string): Promise<DatabaseHandle> {
    // Electron main process holds the better-sqlite3 connection.
    // Renderer calls it over IPC.
    return {
      async execute(sql: string, params: unknown[] = []) {
        await api().invoke("db:execute", { name, sql, params });
      },
      async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
        return api().invoke("db:query", { name, sql, params });
      },
      async close() {
        await api().invoke("db:close", { name });
      },
    };
  }

  async shareText(filename: string, content: string): Promise<void> {
    return api().invoke("fs:saveDialog", { filename, content });
  }
}
