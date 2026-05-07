import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { LOCAL_IMPORT_UPLOAD_CONFIG } from './constants';

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

    for (const file of files) {
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
      for (const [index, file] of files.entries()) {
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

  private sanitizeFileName(value: string) {
    const baseName = path.basename(value).trim() || 'upload';
    return baseName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  }
}
