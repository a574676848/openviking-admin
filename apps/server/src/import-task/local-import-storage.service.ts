import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { LOCAL_IMPORT_UPLOAD_CONFIG } from './constants';

const MOJIBAKE_PATTERN = /[ÃÂ\u0080-\u009f�]/;
const CJK_CHARACTER_PATTERN = /[\u3400-\u9fff]/;

export interface LocalImportUploadFile {
  originalname: string;
  mimetype?: string;
  size: number;
  buffer?: Buffer;
}

export interface StoredLocalImportFile {
  originalName: string;
  sourceUrl: string;
  size: number;
  mimeType: string | null;
}

export interface LocalImportReadableFile {
  fileName: string;
  buffer: Buffer;
  mimeType: string | null;
}

@Injectable()
export class LocalImportStorageService {
  private readonly logger = new Logger(LocalImportStorageService.name);

  constructor(private readonly config: ConfigService) {}

  async saveFiles(
    tenantId: string,
    kbId: string,
    files: LocalImportUploadFile[],
  ): Promise<StoredLocalImportFile[]> {
    if (files.length === 0) {
      throw new BadRequestException('请先上传文件');
    }

    if (files.length > LOCAL_IMPORT_UPLOAD_CONFIG.MAX_FILES) {
      throw new BadRequestException(
        `单次最多上传 ${LOCAL_IMPORT_UPLOAD_CONFIG.MAX_FILES} 个文件`,
      );
    }

    const normalizedFiles = files.map((file) => ({
      ...file,
      originalname: this.normalizeUploadFileName(file.originalname),
    }));

    for (const file of normalizedFiles) {
      this.assertValidFile(file);
    }

    const batchDir = this.resolveManagedPath(
      this.sanitizePathSegment(tenantId),
      this.sanitizePathSegment(kbId),
      randomUUID(),
    );
    await mkdir(batchDir, { recursive: true });

    const stored: StoredLocalImportFile[] = [];
    try {
      for (const [index, file] of normalizedFiles.entries()) {
        const safeName = this.sanitizeFileName(file.originalname);
        const filePath = this.resolveManagedPath(
          path.relative(this.managedRoot, batchDir),
          `${String(index + 1).padStart(2, '0')}-${randomUUID()}-${safeName}`,
        );

        await writeFile(filePath, file.buffer!, { flag: 'wx' });
        stored.push({
          originalName: file.originalname,
          sourceUrl: pathToFileURL(filePath).href,
          size: file.size,
          mimeType: file.mimetype || null,
        });
      }
    } catch (error) {
      await Promise.all(
        stored.map((file) => this.deleteBySourceUrl(file.sourceUrl)),
      );
      throw error;
    }

    return stored;
  }

  async readBySourceUrl(sourceUrl: string): Promise<LocalImportReadableFile> {
    const filePath = this.resolveReadableFilePath(sourceUrl);
    return {
      fileName: path.basename(filePath),
      buffer: await readFile(filePath),
      mimeType: null,
    };
  }

  isManagedFileUrl(sourceUrl: string) {
    try {
      return this.isManagedPath(fileURLToPath(sourceUrl));
    } catch {
      return false;
    }
  }

  async deleteBySourceUrl(sourceUrl: string) {
    if (!this.isManagedFileUrl(sourceUrl)) {
      return;
    }

    try {
      await unlink(fileURLToPath(sourceUrl));
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(`清理本地导入文件失败: ${message}`);
    }
  }

  async cleanupExpiredManagedFiles(retentionMs: number) {
    if (retentionMs <= 0) {
      return { deletedFiles: 0, deletedDirectories: 0 };
    }

    const cutoffTime = Date.now() - retentionMs;
    const managed = await this.cleanupDirectory(
      this.managedRoot,
      this.managedRoot,
      cutoffTime,
      true,
    );
    const gitArchives = await this.cleanupDirectory(
      this.gitArchiveRoot,
      this.gitArchiveRoot,
      cutoffTime,
      true,
    );
    return {
      deletedFiles: managed.deletedFiles + gitArchives.deletedFiles,
      deletedDirectories:
        managed.deletedDirectories + gitArchives.deletedDirectories,
    };
  }

  shouldCleanupAfterDone() {
    return (
      this.config.get<string>(
        LOCAL_IMPORT_UPLOAD_CONFIG.KEEP_AFTER_DONE_ENV,
        'false',
      ) !== 'true'
    );
  }

  private get baseDir() {
    const configured = this.config.get<string>(
      LOCAL_IMPORT_UPLOAD_CONFIG.STORAGE_DIR_ENV,
    );
    return path.resolve(
      configured ||
        path.join(
          process.cwd(),
          ...LOCAL_IMPORT_UPLOAD_CONFIG.DEFAULT_STORAGE_SEGMENTS,
        ),
    );
  }

  private get managedRoot() {
    return path.resolve(
      this.baseDir,
      LOCAL_IMPORT_UPLOAD_CONFIG.MANAGED_UPLOAD_SEGMENT,
    );
  }

  private get gitArchiveRoot() {
    return path.resolve(
      this.baseDir,
      LOCAL_IMPORT_UPLOAD_CONFIG.GIT_ARCHIVE_SEGMENT,
    );
  }

  private assertValidFile(file: LocalImportUploadFile) {
    if (file.size === 0 || (file.buffer && file.buffer.length === 0)) {
      throw new BadRequestException('上传文件不能为空');
    }

    if (file.size > LOCAL_IMPORT_UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('上传文件超过大小限制');
    }

    const extension = path.extname(file.originalname).toLowerCase();
    if (!extension) {
      return;
    }

    if (
      !(
        LOCAL_IMPORT_UPLOAD_CONFIG.ALLOWED_EXTENSIONS as readonly string[]
      ).includes(extension)
    ) {
      throw new BadRequestException(
        `不支持的文件格式：${extension || '未知格式'}`,
      );
    }
  }

  private resolveManagedPath(...segments: string[]) {
    const target = path.resolve(this.managedRoot, ...segments);
    if (!this.isManagedPath(target)) {
      throw new BadRequestException('非法上传文件路径');
    }
    return target;
  }

  private isManagedPath(targetPath: string) {
    const relative = path.relative(this.managedRoot, path.resolve(targetPath));
    return (
      Boolean(relative) &&
      !relative.startsWith('..') &&
      !path.isAbsolute(relative)
    );
  }

  private resolveReadableFilePath(sourceUrl: string) {
    const filePath = fileURLToPath(sourceUrl);
    if (!this.isManagedPath(filePath)) {
      throw new BadRequestException('本地导入文件不在受控上传目录内');
    }
    return filePath;
  }

  private sanitizePathSegment(value: string) {
    return value.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'unknown';
  }

  private normalizeUploadFileName(value: string) {
    const trimmed = value.trim();
    const decoded = Buffer.from(trimmed, 'latin1').toString('utf8').trim();
    const shouldUseDecoded =
      MOJIBAKE_PATTERN.test(trimmed) ||
      (!CJK_CHARACTER_PATTERN.test(trimmed) &&
        CJK_CHARACTER_PATTERN.test(decoded));
    return shouldUseDecoded && decoded ? decoded : trimmed;
  }

  private sanitizeFileName(value: string) {
    const baseName = path.basename(value).trim() || 'upload';
    return baseName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  }

  private async cleanupDirectory(
    dirPath: string,
    boundaryPath: string,
    cutoffTime: number,
    isRoot = false,
  ): Promise<{ deletedFiles: number; deletedDirectories: number }> {
    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      return { deletedFiles: 0, deletedDirectories: 0 };
    }

    let deletedFiles = 0;
    let deletedDirectories = 0;
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (!this.isPathWithin(boundaryPath, entryPath)) {
        continue;
      }
      if (entry.isDirectory()) {
        const result = await this.cleanupDirectory(
          entryPath,
          boundaryPath,
          cutoffTime,
        );
        deletedFiles += result.deletedFiles;
        deletedDirectories += result.deletedDirectories;
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }
      const info = await stat(entryPath).catch(() => null);
      if (!info || info.mtimeMs > cutoffTime) {
        continue;
      }
      await rm(entryPath, { force: true });
      deletedFiles += 1;
    }

    if (!isRoot) {
      const remaining = await readdir(dirPath).catch(() => []);
      if (remaining.length === 0) {
        await rm(dirPath, { recursive: true, force: true });
        deletedDirectories += 1;
      }
    }

    return { deletedFiles, deletedDirectories };
  }

  private isPathWithin(rootPath: string, targetPath: string) {
    const relative = path.relative(
      path.resolve(rootPath),
      path.resolve(targetPath),
    );
    return (
      Boolean(relative) &&
      !relative.startsWith('..') &&
      !path.isAbsolute(relative)
    );
  }
}
