import { callApi } from '../api';
import type { CredentialStore } from '../state-store';
import { readProfile } from '../state-store';
import { emitOutput, resolveOutputMode } from '../output';

export async function handleKnowledge(
    command: string,
    options: Record<string, string | boolean>,
    store: CredentialStore,
) {
    const output = resolveOutputMode(options);
    const { profileName } = readProfile(store, options);
    const path = command === 'search' ? '/api/v1/knowledge/search' : '/api/v1/knowledge/grep';
    const response = await callApi(
        path,
        {
            method: 'POST',
            body: JSON.stringify(
                command === 'search'
                    ? {
                          query: options.query,
                          limit: options.limit ? Number(options.limit) : undefined,
                          scoreThreshold: options['score-threshold'] ? Number(options['score-threshold']) : undefined,
                      }
                    : {
                          pattern: options.pattern,
                          uri: options.uri,
                          caseInsensitive:
                              options['case-insensitive'] === undefined
                                  ? undefined
                                  : options['case-insensitive'] === 'true',
                      },
            ),
        },
        options,
        store,
    );

    const items = ((response.data as Record<string, unknown>).items ?? []) as Array<Record<string, unknown>>;
    const traceId = String(response.traceId ?? '');
    emitOutput(
        output,
        response,
        () =>
            command === 'search'
                ? [`traceId: ${traceId}`, ...items.map((item) => `${String(item.uri)} [${String(item.score)}]`)].join('\n')
                : [`traceId: ${traceId}`, ...items.map((item) => `L${String(item.line)} ${String(item.uri)}\n  ${String(item.content)}`)].join(
                      '\n',
                  ),
        items.map((item) => ({
            profile: profileName,
            command,
            traceId,
            ...item,
        })),
    );
}
