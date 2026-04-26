import { callApi } from '../api';
import type { CredentialStore } from '../state-store';
import { readProfile } from '../state-store';
import { emitOutput, resolveOutputMode } from '../output';

export async function handleResources(
    command: string,
    options: Record<string, string | boolean>,
    store: CredentialStore,
) {
    const output = resolveOutputMode(options);
    const { profileName } = readProfile(store, options);
    const searchParams = new URLSearchParams();
    if (options.uri) {
        searchParams.set('uri', String(options.uri));
    }
    if (options.depth) {
        searchParams.set('depth', String(options.depth));
    }

    const path =
        command === 'tree'
            ? `/api/v1/resources/tree?${searchParams.toString()}`
            : `/api/v1/resources?${searchParams.toString()}`;
    const response = await callApi(path, {}, options, store);
    const data = response.data as Record<string, unknown>;

    if (command === 'tree') {
        const payload = {
            profile: profileName,
            traceId: String(response.traceId ?? ''),
            renderedTree: String(data.renderedTree ?? ''),
        };
        emitOutput(
            output,
            response,
            () => [`traceId: ${payload.traceId}`, payload.renderedTree].join('\n'),
            [payload],
        );
        return;
    }

    const items = (data.items ?? []) as Array<Record<string, unknown>>;
    emitOutput(
        output,
        response,
        () =>
            [`traceId: ${String(response.traceId ?? '')}`, ...items.map((item) => `${item.isDir ? '[DIR]' : '[FILE]'} ${String(item.uri)}`)].join(
                '\n',
            ),
        items.map((item) => ({
            profile: profileName,
            traceId: response.traceId,
            ...item,
        })),
    );
}
