import { callApi } from '../api';
import type { CredentialStore } from '../state-store';
import { readProfile } from '../state-store';
import { emitOutput, resolveOutputMode } from '../output';

export async function handleCapabilities(
    command: string,
    options: Record<string, string | boolean>,
    store: CredentialStore,
) {
    const output = resolveOutputMode(options);
    const { profileName } = readProfile(store, options);
    const response = await callApi('/api/v1/capabilities', {}, options, store);
    const items = response.data as Array<Record<string, unknown>>;

    if (command === 'list') {
        emitOutput(
            output,
            response,
            () =>
                items
                    .map(
                        (item) =>
                            `${String(item.id)}\n  ${String(item.description)}\n  HTTP: ${String(
                                (item.http as Record<string, unknown>).method,
                            )} ${String((item.http as Record<string, unknown>).path)}`,
                    )
                    .join('\n\n'),
            items.map((item) => ({
                profile: profileName,
                ...item,
            })),
        );
        return;
    }

    if (command === 'inspect') {
        const capabilityId = String(options.id ?? '');
        const item = items.find((candidate) => String(candidate.id) === capabilityId);
        if (!item) {
            throw new Error(`未找到 capability: ${capabilityId}`);
        }

        emitOutput(
            output,
            item,
            () =>
                [
                    `id: ${String(item.id)}`,
                    `version: ${String(item.version ?? '-')}`,
                    `description: ${String(item.description ?? '-')}`,
                    `minimumRole: ${String(item.minimumRole ?? '-')}`,
                    `auditLevel: ${String(item.auditLevel ?? '-')}`,
                    `http: ${String((item.http as Record<string, unknown>).method)} ${String(
                        (item.http as Record<string, unknown>).path,
                    )}`,
                    `cli: ${String(item.cli ?? '-')}`,
                ].join('\n'),
            [
                {
                    profile: profileName,
                    ...item,
                },
            ],
        );
        return;
    }

    throw new Error(`未知 capabilities 子命令: ${command}`);
}
