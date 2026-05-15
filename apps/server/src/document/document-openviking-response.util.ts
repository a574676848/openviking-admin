export function findOpenVikingInjectedLeaf(
  response: unknown,
  containerUri: string,
  fileName: string,
): string | null {
  const entries = extractOpenVikingResourceEntries(response);
  const leaves = entries.filter((entry) => entry.isDir === false);
  const expectedUri = `${containerUri}${fileName}`;
  const exactLeaf = leaves.find((entry) => entry.uri === expectedUri);

  if (exactLeaf) {
    return exactLeaf.uri;
  }

  return leaves.length === 1 ? leaves[0].uri : null;
}

export function extractOpenVikingTempFileId(response: unknown): string {
  const result =
    response && typeof response === 'object'
      ? (response as { result?: unknown }).result
      : null;
  const tempFileId =
    result && typeof result === 'object'
      ? (result as { temp_file_id?: unknown }).temp_file_id
      : null;
  if (typeof tempFileId !== 'string' || tempFileId.trim().length === 0) {
    throw new Error('OpenViking 临时文件上传未返回 temp_file_id');
  }
  return tempFileId;
}

export function assertOpenVikingSuccess(
  response: unknown,
  fallbackMessage: string,
): void {
  const result =
    response && typeof response === 'object'
      ? (response as { result?: unknown }).result
      : null;
  const status =
    result && typeof result === 'object'
      ? (result as { status?: unknown }).status
      : null;
  if (status !== 'error') {
    return;
  }

  const errors =
    result && typeof result === 'object'
      ? (result as { errors?: unknown }).errors
      : null;
  if (Array.isArray(errors) && errors.length > 0) {
    throw new Error(errors.map((item) => String(item)).join('; '));
  }
  throw new Error(fallbackMessage);
}

function extractOpenVikingResourceEntries(
  response: unknown,
): Array<{ uri: string; isDir?: boolean }> {
  const result =
    response && typeof response === 'object'
      ? (response as { result?: unknown }).result
      : null;
  if (!Array.isArray(result)) {
    return [];
  }

  return result.filter((entry): entry is { uri: string; isDir?: boolean } =>
    Boolean(
      entry &&
      typeof entry === 'object' &&
      typeof (entry as { uri?: unknown }).uri === 'string',
    ),
  );
}
