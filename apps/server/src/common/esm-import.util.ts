type NativeDynamicImport = <TModule>(specifier: string) => Promise<TModule>;

const nativeDynamicImport = new Function(
  'specifier',
  'return import(specifier)',
) as NativeDynamicImport;

export function importEsmModule<TModule>(specifier: string): Promise<TModule> {
  // 仅用于加载服务端固定 ESM 依赖，调用方不得传入用户输入。
  return nativeDynamicImport<TModule>(specifier);
}
