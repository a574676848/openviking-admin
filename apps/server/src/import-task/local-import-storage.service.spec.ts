import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BadRequestException } from '@nestjs/common';
import { LocalImportStorageService } from './local-import-storage.service';

describe('LocalImportStorageService', () => {
  let tempDir: string;
  let service: LocalImportStorageService;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'ov-local-import-'));
    service = new LocalImportStorageService({
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'LOCAL_IMPORT_UPLOAD_DIR') return tempDir;
        if (key === 'LOCAL_IMPORT_KEEP_FILES_AFTER_DONE') return fallback;
        return fallback;
      }),
    } as never);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('会把合法上传文件写入受控目录并生成 file URL', async () => {
    const [stored] = await service.saveFiles('tenant-a', 'kb-1', [
      {
        originalname: '产品手册.md',
        mimetype: 'text/markdown',
        size: 6,
        buffer: Buffer.from('手册'),
      },
    ]);

    expect(stored.sourceUrl).toMatch(/^file:/);
    expect(service.isManagedFileUrl(stored.sourceUrl)).toBe(true);
    await expect(readFile(new URL(stored.sourceUrl), 'utf8')).resolves.toBe(
      '手册',
    );
  });

  it('会拒绝不在白名单内的文件格式', async () => {
    await expect(
      service.saveFiles('tenant-a', 'kb-1', [
        {
          originalname: 'payload.exe',
          mimetype: 'application/octet-stream',
          size: 4,
          buffer: Buffer.from('test'),
        },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('会拒绝读取非受控上传目录内的文件', async () => {
    const outsideDir = await mkdtemp(path.join(os.tmpdir(), 'ov-outside-'));
    const filePath = path.join(outsideDir, 'manual.md');
    await writeFile(filePath, 'outside');

    try {
      await expect(service.readBySourceUrl(pathToFileURL(filePath).href))
        .rejects.toThrow(
          '本地导入文件不在受控上传目录内',
      );
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('会从受控上传目录读取文件内容供 OpenViking temp_upload 使用', async () => {
    const [stored] = await service.saveFiles('tenant-a', 'kb-1', [
      {
        originalname: 'guide.md',
        mimetype: 'text/markdown',
        size: 5,
        buffer: Buffer.from('guide'),
      },
    ]);

    const readable = await service.readBySourceUrl(stored.sourceUrl);

    expect(readable.fileName).toBeTruthy();
    expect(readable.buffer.toString('utf8')).toBe('guide');
  });
});
