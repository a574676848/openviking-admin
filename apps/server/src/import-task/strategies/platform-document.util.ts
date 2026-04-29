const MARKDOWN_MIME_TYPE = 'text/markdown;charset=utf-8';
const FILE_NAME_UNSAFE_CHARS = /[\\/:*?"<>|\r\n]+/g;

export function createMarkdownTempFile(input: {
  title: string;
  content: string;
  fallbackName: string;
  sourceUrl: string;
}) {
  const title = input.title.trim() || input.fallbackName;
  const body = [`# ${title}`, '', `来源：${input.sourceUrl}`, '', input.content.trim()]
    .filter((item) => item.length > 0)
    .join('\n');

  return {
    fileName: `${sanitizeFileName(title, input.fallbackName)}.md`,
    buffer: Buffer.from(body, 'utf8'),
    mimeType: MARKDOWN_MIME_TYPE,
  };
}

export function sanitizeFileName(value: string, fallback: string) {
  const sanitized = value.replace(FILE_NAME_UNSAFE_CHARS, '_').trim();
  return sanitized.length > 0 ? sanitized.slice(0, 80) : fallback;
}
