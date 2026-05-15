import { UnsupportedMediaTypeException } from '@nestjs/common';
import { extname } from 'node:path';
import { SystemRoles } from '../users/entities/user.entity';

const DOCUMENT_ASSET_MAX_FILE_SIZE_MB = 10;
const BYTES_PER_MB = 1024 * 1024;

export const DOCUMENT_ASSET_UPLOAD_CONFIG = {
  FIELD_NAME: 'files',
  MAX_FILES: 10,
  MAX_FILE_SIZE_BYTES: DOCUMENT_ASSET_MAX_FILE_SIZE_MB * BYTES_PER_MB,
  ALLOWED_EXTENSIONS: new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.svg',
  ]),
  ALLOWED_MIME_TYPES: new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
  ]),
} as const;

export const DOCUMENT_WRITE_ROLES = [
  SystemRoles.SUPER_ADMIN,
  SystemRoles.TENANT_ADMIN,
  SystemRoles.TENANT_OPERATOR,
] as const;
export const DOCUMENT_WRITE_ROLE_SET: ReadonlySet<string> = new Set(
  DOCUMENT_WRITE_ROLES,
);
export const DOCUMENT_COLLAB_ROUTE_PATH = 'collab';
export const DOCUMENT_COLLAB_PATH = `/${DOCUMENT_COLLAB_ROUTE_PATH}`;
export const DOCUMENT_COLLAB_NAME_PREFIX = 'document';
export const DOCUMENT_YJS_FRAGMENT_NAME = 'document-store';
export const DOCUMENT_GLOBAL_TENANT_SCOPE = 'global';
export const DOCUMENT_ASSET_CACHE_CONTROL = 'private, max-age=300';
export const DOCUMENT_ASSET_NOSNIFF_HEADER = 'nosniff';
export const DOCUMENT_SVG_MIME_TYPE = 'image/svg+xml';
export const DOCUMENT_SVG_EXTENSION = '.svg';
export const DOCUMENT_CONTENT_DOWNLOAD_PATH = '/api/v1/content/download';
export const DOCUMENT_CONTENT_WRITE_PATH = '/api/v1/content/write';
export const DOCUMENT_MAINTENANCE_REINDEX_PATH = '/api/v1/maintenance/reindex';
export const DOCUMENT_FS_PATH = '/api/v1/fs';
export const DOCUMENT_FS_TREE_PATH = '/api/v1/fs/tree';
export const DOCUMENT_RESOURCES_PATH = '/api/v1/resources';
export const DOCUMENT_TEMP_UPLOAD_PATH = '/api/v1/resources/temp_upload';
export const DOCUMENT_CONTENT_DOWNLOAD_LABEL = 'OpenViking 内容下载';
export const DOCUMENT_RESOURCE_SERVICE_LABEL = 'OpenViking Resources';
export const DOCUMENT_RESOURCE_TREE_LABEL = 'OpenViking 资源树';
export const DOCUMENT_RESOURCE_DELETE_LABEL = 'OpenViking 资源删除';
export const DOCUMENT_SAVE_REASON = 'collab-save';
export const DOCUMENT_INDEX_REASON = 'manual-index';
export const DOCUMENT_ASSET_UPLOAD_REASON = 'collab-asset-upload';
export const DOCUMENT_ASSET_DEDUP_HASH_ALGORITHM = 'sha256';
export const DOCUMENT_MARKDOWN_MIME_TYPE = 'text/markdown;charset=utf-8';
export const DOCUMENT_DEFAULT_CONTENT_FILE_NAME = 'content.md';
export const DOCUMENT_CONTENT_FILE_PREFIX = 'content';
export const DOCUMENT_ASSET_FILE_PREFIX = 'asset';
export const DOCUMENT_MARKDOWN_EXTENSION = '.md';
export const DOCUMENT_DIRECTORY_URI_SUFFIX = '/';
export const DOCUMENT_ASSETS_DIRECTORY = 'assets';
export const DOCUMENT_FILE_TIMESTAMP_RADIX = 36;
export const DEFAULT_OPENVIKING_ACCOUNT = 'default';
export const ASSET_FILE_NAME_UNSAFE_CHARS = /[\\/:*?"<>|\r\n]+/g;
export const ASSET_FILE_NAME_MAX_LENGTH = 160;
export const DOCUMENT_ASSET_DEDUP_CACHE_TTL_SECONDS = 1800;

export function documentAssetFileFilter(
  _request: unknown,
  file: { originalname?: string; mimetype?: string },
  callback: (error: Error | null, acceptFile: boolean) => void,
): void {
  const extension = extname(file.originalname ?? '').toLowerCase();
  const mimeType = file.mimetype ?? '';
  const isAllowed =
    DOCUMENT_ASSET_UPLOAD_CONFIG.ALLOWED_EXTENSIONS.has(extension) &&
    DOCUMENT_ASSET_UPLOAD_CONFIG.ALLOWED_MIME_TYPES.has(mimeType);

  if (!isAllowed) {
    callback(new UnsupportedMediaTypeException('不支持的图片格式。'), false);
    return;
  }

  callback(null, true);
}
