/**
 * Capacitor platform implementation (iOS iPad + macOS).
 */

import type { Platform, FileMeta, DatabaseHandle } from "./index";

export class CapacitorPlatform implements Platform {
  constructor(public name: "capacitor-ios" | "capacitor-mac") {}

  async pickVideoFile(): Promise<FileMeta | null> {
    const { FilePicker } = await import(/* @vite-ignore */ "@capawesome/capacitor-file-picker");
    try {
      const result = await (FilePicker as any).pickFiles({
        types: ["public.movie", "public.mpeg-4", "com.apple.m4v-video"],
        multiple: false,
      });
      const file = result?.files?.[0];
      if (!file) return null;
      return { name: file.name, path: file.path ?? file.webPath, size: file.size ?? 0 };
    } catch {
      return null;
    }
  }

  async pickPdfFile(): Promise<FileMeta | null> {
    const { FilePicker } = await import(/* @vite-ignore */ "@capawesome/capacitor-file-picker");
    try {
      const result = await (FilePicker as any).pickFiles({
        types: ["com.adobe.pdf"],
        multiple: false,
      });
      const file = result?.files?.[0];
      if (!file) return null;
      return { name: file.name, path: file.path ?? file.webPath, size: file.size ?? 0 };
    } catch {
      return null;
    }
  }

  async readTextFile(path: string): Promise<string> {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    const result = await Filesystem.readFile({ path, encoding: Encoding.UTF8 });
    return result.data as string;
  }

  async secureSet(key: string, value: string): Promise<void> {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key, value });
  }

  async secureGet(key: string): Promise<string | null> {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key });
    return value;
  }

  async secureDel(key: string): Promise<void> {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key });
  }

  async openDatabase(name: string): Promise<DatabaseHandle> {
    const { CapacitorSQLite, SQLiteConnection } = await import("@capacitor-community/sqlite");
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    const db = await sqlite.createConnection(name, false, "no-encryption", 1, false);
    await db.open();
    return {
      async execute(sql, params = []) {
        await db.run(sql, params);
      },
      async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
        const result = await db.query(sql, params);
        return (result.values ?? []) as T[];
      },
      async close() {
        await sqlite.closeConnection(name, false);
      },
    };
  }

  async shareText(filename: string, content: string): Promise<void> {
    const { Share } = await import(/* @vite-ignore */ "@capacitor/share");
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    // Write to temp file then share
    const path = `foundationgaps_export_${Date.now()}.md`;
    await Filesystem.writeFile({ path, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    await Share.share({ title: filename, url: uri });
  }
}
