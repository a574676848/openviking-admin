"use client";

import { apiClient } from "@/lib/apiClient";
import { readSessionToken } from "@/lib/session";

interface DocumentAssetUploadResponse {
  assets: Array<{
    path: string;
    uri: string;
  }>;
}

interface DocumentAssetObjectUrlStoreOptions {
  createObjectUrl?: (blob: Blob) => string;
  fetchAsset?: typeof fetch;
  readToken?: () => string | null;
  revokeObjectUrl?: (url: string) => void;
  wait?: (ms: number) => Promise<void>;
}

interface DocumentAssetCompressionOptions {
  createCanvas?: () => HTMLCanvasElement;
  createImage?: () => HTMLImageElement;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
}

export interface DocumentAssetObjectUrlStore {
  rememberUploadedAsset: (assetPath: string, file: File) => string;
  resolveFileUrl: (assetPath: string) => Promise<string>;
  revokeAll: () => void;
}

const API_PREFIX = "/api/v1";
const DOCUMENT_ASSET_ENDPOINT_SUFFIX = "assets";
const DOCUMENT_ASSET_FORM_FIELD_NAME = "files";
const DOCUMENT_ASSET_MAX_FILE_SIZE_MB = 10;
const BYTES_PER_MB = 1024 * 1024;
const DOCUMENT_ASSET_MAX_FILE_SIZE_BYTES =
  DOCUMENT_ASSET_MAX_FILE_SIZE_MB * BYTES_PER_MB;
const FILE_EXTENSION_SEPARATOR = ".";
const DOCUMENT_ASSET_RELATIVE_PREFIX = "assets/";
const PATH_SEPARATOR = "/";
const PARENT_PATH_SEGMENT = "..";
const BLOB_URL_PREFIX = "blob:";
const DATA_URL_PREFIX = "data:";
const HTTP_URL_PREFIX = "http://";
const HTTPS_URL_PREFIX = "https://";
const ASSET_LOAD_AUTH_MESSAGE = "登录状态已失效，请重新登录后查看图片。";
const ASSET_LOAD_ERROR_MESSAGE = "图片加载失败。";
const INVALID_ASSET_PATH_MESSAGE = "仅支持预览当前文档 assets 目录下的图片。";
const ASSET_LOAD_RETRY_ATTEMPTS = 3;
const ASSET_LOAD_RETRY_DELAY_MS = 300;
const DOCUMENT_ASSET_COMPRESSION_MAX_DIMENSION = 2400;
const DOCUMENT_ASSET_COMPRESSION_TARGET_MIME_TYPE = "image/webp";
const DOCUMENT_ASSET_COMPRESSION_INITIAL_QUALITY = 0.82;
const DOCUMENT_ASSET_COMPRESSION_MIN_QUALITY = 0.6;
const DOCUMENT_ASSET_COMPRESSION_QUALITY_STEP = 0.08;
const DOCUMENT_ASSET_COMPRESSION_SKIP_SIZE_BYTES = 1024 * 1024;
const DOCUMENT_ASSET_COMPRESSION_TARGET_MAX_BYTES = 2 * BYTES_PER_MB;
const SUPPORTED_INLINE_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
]);
const SUPPORTED_INLINE_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
const COMPRESSIBLE_INLINE_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export function buildDocumentAssetsEndpoint(nodeId: string): string {
  return `/editor/${encodeURIComponent(nodeId)}/${DOCUMENT_ASSET_ENDPOINT_SUFFIX}`;
}

function normalizeApiEndpoint(endpoint: string): string {
  if (endpoint.startsWith(API_PREFIX)) {
    return endpoint;
  }
  return `${API_PREFIX}${endpoint.startsWith(PATH_SEPARATOR) ? endpoint : `${PATH_SEPARATOR}${endpoint}`}`;
}

function isPassthroughAssetPath(assetPath: string): boolean {
  return (
    assetPath.length === 0 ||
    assetPath.startsWith(BLOB_URL_PREFIX) ||
    assetPath.startsWith(DATA_URL_PREFIX) ||
    assetPath.startsWith(HTTP_URL_PREFIX) ||
    assetPath.startsWith(HTTPS_URL_PREFIX)
  );
}

export function resolveDocumentAssetFileName(assetPath: string): string {
  const normalizedPath = assetPath.trim().replaceAll("\\", PATH_SEPARATOR);
  if (!normalizedPath.startsWith(DOCUMENT_ASSET_RELATIVE_PREFIX)) {
    throw new Error(INVALID_ASSET_PATH_MESSAGE);
  }

  const fileName = normalizedPath.slice(DOCUMENT_ASSET_RELATIVE_PREFIX.length);
  if (
    !fileName ||
    fileName.includes(PATH_SEPARATOR) ||
    fileName.includes(PARENT_PATH_SEGMENT)
  ) {
    throw new Error(INVALID_ASSET_PATH_MESSAGE);
  }

  return fileName;
}

export function buildDocumentAssetReadEndpoint(
  nodeId: string,
  assetPath: string,
): string {
  const fileName = resolveDocumentAssetFileName(assetPath);
  return `${buildDocumentAssetsEndpoint(nodeId)}/${encodeURIComponent(fileName)}`;
}

function getFileExtension(fileName: string): string {
  const index = fileName.lastIndexOf(FILE_EXTENSION_SEPARATOR);
  if (index < 0) {
    return "";
  }
  return fileName.slice(index).toLowerCase();
}

export function validateDocumentAssetFile(file: File): string | null {
  const extension = getFileExtension(file.name);
  if (
    !SUPPORTED_INLINE_IMAGE_EXTENSIONS.has(extension) ||
    !SUPPORTED_INLINE_IMAGE_MIME_TYPES.has(file.type)
  ) {
    return "仅支持 PNG、JPG、GIF、WebP 图片直接插入正文。SVG 暂不支持内联渲染。";
  }

  if (file.size > DOCUMENT_ASSET_MAX_FILE_SIZE_BYTES) {
    return `图片大小不能超过 ${DOCUMENT_ASSET_MAX_FILE_SIZE_MB}MB。`;
  }

  return null;
}

function replaceFileExtension(fileName: string, nextExtension: string): string {
  const index = fileName.lastIndexOf(FILE_EXTENSION_SEPARATOR);
  if (index < 0) {
    return `${fileName}${nextExtension}`;
  }
  return `${fileName.slice(0, index)}${nextExtension}`;
}

function calculateCompressionDimensions(width: number, height: number): {
  width: number;
  height: number;
} {
  const longestSide = Math.max(width, height);
  if (longestSide <= DOCUMENT_ASSET_COMPRESSION_MAX_DIMENSION) {
    return { width, height };
  }

  const ratio = DOCUMENT_ASSET_COMPRESSION_MAX_DIMENSION / longestSide;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function loadImageElement(
  file: File,
  {
    createImage = () => new Image(),
    createObjectUrl = (blob) => URL.createObjectURL(blob),
    revokeObjectUrl = (url) => URL.revokeObjectURL(url),
  }: DocumentAssetCompressionOptions = {},
): Promise<{
  image: HTMLImageElement;
  objectUrl: string;
}> {
  return new Promise((resolve, reject) => {
    const image = createImage();
    const objectUrl = createObjectUrl(file);

    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      revokeObjectUrl(objectUrl);
      reject(new Error("图片压缩预处理失败。"));
    };
    image.src = objectUrl;
  });
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export async function compressDocumentAssetFile(
  file: File,
  options: DocumentAssetCompressionOptions = {},
): Promise<File> {
  if (
    file.size <= DOCUMENT_ASSET_COMPRESSION_SKIP_SIZE_BYTES ||
    !COMPRESSIBLE_INLINE_IMAGE_MIME_TYPES.has(file.type)
  ) {
    return file;
  }

  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof URL === "undefined"
  ) {
    return file;
  }

  const {
    createCanvas = () => document.createElement("canvas"),
    revokeObjectUrl = (url) => URL.revokeObjectURL(url),
  } = options;

  let loadedImage: Awaited<ReturnType<typeof loadImageElement>> | null = null;
  try {
    loadedImage = await loadImageElement(file, options);
    const { width, height } = calculateCompressionDimensions(
      loadedImage.image.naturalWidth || loadedImage.image.width,
      loadedImage.image.naturalHeight || loadedImage.image.height,
    );
    const canvas = createCanvas();
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return file;
    }

    context.drawImage(loadedImage.image, 0, 0, width, height);
    let quality = DOCUMENT_ASSET_COMPRESSION_INITIAL_QUALITY;
    let bestBlob: Blob | null = null;

    while (quality >= DOCUMENT_ASSET_COMPRESSION_MIN_QUALITY) {
      const candidateBlob = await canvasToBlob(
        canvas,
        DOCUMENT_ASSET_COMPRESSION_TARGET_MIME_TYPE,
        quality,
      );
      if (!candidateBlob) {
        break;
      }
      bestBlob = candidateBlob;
      if (candidateBlob.size <= DOCUMENT_ASSET_COMPRESSION_TARGET_MAX_BYTES) {
        break;
      }
      quality -= DOCUMENT_ASSET_COMPRESSION_QUALITY_STEP;
    }

    if (!bestBlob || bestBlob.size >= file.size) {
      return file;
    }

    return new File(
      [bestBlob],
      replaceFileExtension(file.name, ".webp"),
      {
        type: DOCUMENT_ASSET_COMPRESSION_TARGET_MIME_TYPE,
        lastModified: file.lastModified,
      },
    );
  } catch {
    return file;
  } finally {
    if (loadedImage) {
      revokeObjectUrl(loadedImage.objectUrl);
    }
  }
}

export async function uploadDocumentAsset(
  nodeId: string,
  file: File,
): Promise<string> {
  const validationError = validateDocumentAssetFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const normalizedFile = await compressDocumentAssetFile(file);
  const normalizedFileValidationError = validateDocumentAssetFile(normalizedFile);
  if (normalizedFileValidationError) {
    throw new Error(normalizedFileValidationError);
  }

  const formData = new FormData();
  formData.append(DOCUMENT_ASSET_FORM_FIELD_NAME, normalizedFile);

  const result = await apiClient.request<DocumentAssetUploadResponse>(
    buildDocumentAssetsEndpoint(nodeId),
    {
      method: "POST",
      body: formData,
    },
  );
  const assetPath = result.assets[0]?.path;
  if (!assetPath) {
    throw new Error("图片上传成功，但后端未返回资源路径。");
  }
  return assetPath;
}

export function createDocumentAssetObjectUrlStore(
  nodeId: string,
  {
    createObjectUrl = (blob) => URL.createObjectURL(blob),
    fetchAsset = fetch,
    readToken = readSessionToken,
    revokeObjectUrl = (url) => URL.revokeObjectURL(url),
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }: DocumentAssetObjectUrlStoreOptions = {},
): DocumentAssetObjectUrlStore {
  const objectUrls = new Map<string, string>();

  return {
    rememberUploadedAsset(assetPath: string, file: File): string {
      const fileName = resolveDocumentAssetFileName(assetPath);
      const normalizedAssetPath = `${DOCUMENT_ASSET_RELATIVE_PREFIX}${fileName}`;
      const existingObjectUrl = objectUrls.get(normalizedAssetPath);
      if (existingObjectUrl) {
        return existingObjectUrl;
      }

      const objectUrl = createObjectUrl(file);
      objectUrls.set(normalizedAssetPath, objectUrl);
      return objectUrl;
    },
    async resolveFileUrl(assetPath: string): Promise<string> {
      const normalizedInput = assetPath.trim();
      if (isPassthroughAssetPath(normalizedInput)) {
        return normalizedInput;
      }

      const fileName = resolveDocumentAssetFileName(assetPath);
      const normalizedAssetPath = `${DOCUMENT_ASSET_RELATIVE_PREFIX}${fileName}`;
      const existingObjectUrl = objectUrls.get(normalizedAssetPath);
      if (existingObjectUrl) {
        return existingObjectUrl;
      }

      const token = readToken();
      if (!token) {
        throw new Error(ASSET_LOAD_AUTH_MESSAGE);
      }

      const endpoint = normalizeApiEndpoint(
        buildDocumentAssetReadEndpoint(nodeId, normalizedAssetPath),
      );
      let response: Response | null = null;
      let lastStatus = 500;
      for (let attempt = 0; attempt < ASSET_LOAD_RETRY_ATTEMPTS; attempt += 1) {
        response = await fetchAsset(endpoint, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        lastStatus = response.status;
        if (response.ok || response.status !== 404) {
          break;
        }
        if (attempt < ASSET_LOAD_RETRY_ATTEMPTS - 1) {
          await wait(ASSET_LOAD_RETRY_DELAY_MS);
        }
      }
      if (!response || !response.ok) {
        throw new Error(`${ASSET_LOAD_ERROR_MESSAGE} (${lastStatus})`);
      }

      const objectUrl = createObjectUrl(await response.blob());
      objectUrls.set(normalizedAssetPath, objectUrl);
      return objectUrl;
    },
    revokeAll(): void {
      for (const objectUrl of objectUrls.values()) {
        revokeObjectUrl(objectUrl);
      }
      objectUrls.clear();
    },
  };
}
