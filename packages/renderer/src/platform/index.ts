/**
 * Platform abstraction layer.
 *
 * The app runs in three environments:
 *   - Capacitor/iOS  (iPad)
 *   - Capacitor/macOS
 *   - Electron       (Windows / Mac)
 *
 * All environment-specific calls go through this interface.
 * Components never import Capacitor or Electron directly.
 */

export interface FileMeta {
  name: string;
  path: string;   // URI on iOS, absolute path on Electron
  size: number;
}

export interface Platform {
  name: "capacitor-ios" | "capacitor-mac" | "electron" | "web";

  // File system
  pickVideoFile(): Promise<FileMeta | null>;
  pickPdfFile(): Promise<FileMeta | null>;
  readTextFile(path: string): Promise<string>;

  // Secure key-value store (Keychain on iOS, credential store on Electron)
  secureSet(key: string, value: string): Promise<void>;
  secureGet(key: string): Promise<string | null>;
  secureDel(key: string): Promise<void>;

  // SQLite — returns a connection handle
  openDatabase(name: string): Promise<DatabaseHandle>;

  // Share / export
  shareText(filename: string, content: string): Promise<void>;
}

export interface DatabaseHandle {
  execute(sql: string, params?: unknown[]): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

// ── Runtime detection ────────────────────────────────────────────────────────

function detectPlatform(): Platform["name"] {
  // Capacitor sets window.Capacitor when running in a native shell
  if (typeof (window as any).Capacitor !== "undefined") {
    const platform = (window as any).Capacitor.getPlatform?.() ?? "";
    if (platform === "ios") return "capacitor-ios";
    if (platform === "mac" || platform === "macos") return "capacitor-mac";
  }
  // Electron exposes window.electronAPI via contextBridge
  if (typeof (window as any).electronAPI !== "undefined") return "electron";
  return "web";
}

// Lazy-loaded platform implementation
let _platform: Platform | null = null;

export async function getPlatform(): Promise<Platform> {
  if (_platform) return _platform;
  const name = detectPlatform();

  if (name === "capacitor-ios" || name === "capacitor-mac") {
    const { CapacitorPlatform } = await import("./capacitor");
    _platform = new CapacitorPlatform(name);
  } else if (name === "electron") {
    const { ElectronPlatform } = await import("./electron");
    _platform = new ElectronPlatform();
  } else {
    const { WebPlatform } = await import("./web");
    _platform = new WebPlatform();
  }
  return _platform;
}
