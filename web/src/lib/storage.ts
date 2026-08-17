import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

export interface StorageAdapter {
  save(data: Buffer, extension: string): Promise<{ storagePath: string; storedFilename: string }>;
  delete(storagePath: string): Promise<void>;
  read(storagePath: string): Promise<Buffer>;
  getUrl(storagePath: string): string;
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly root = path.resolve(process.env.MEDIA_STORAGE_ROOT ?? path.join(process.cwd(), ".data", "uploads"))) {}

  private resolveSafe(storagePath: string) {
    const absolute = path.resolve(this.root, storagePath);
    const rootWithSeparator = `${this.root}${path.sep}`;
    if (absolute !== this.root && !absolute.startsWith(rootWithSeparator)) {
      throw new Error("Invalid storage path.");
    }
    return absolute;
  }

  async save(data: Buffer, extension: string) {
    const normalizedExtension = extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (!normalizedExtension) throw new Error("Invalid file extension.");
    await mkdir(this.root, { recursive: true, mode: 0o750 });
    const storedFilename = `${randomBytes(24).toString("hex")}.${normalizedExtension}`;
    const storagePath = storedFilename;
    await writeFile(this.resolveSafe(storagePath), data, { flag: "wx", mode: 0o640 });
    return { storagePath, storedFilename };
  }

  async delete(storagePath: string) {
    await rm(this.resolveSafe(storagePath), { force: true });
  }

  async read(storagePath: string) {
    return readFile(this.resolveSafe(storagePath));
  }

  getUrl(storagePath: string) {
    return `/api/media/file/${encodeURIComponent(storagePath)}`;
  }
}

export const localStorage = new LocalStorageAdapter();
