import { callApi } from '../api';
import type { CredentialStore } from '../state-store';
import { emitOutput, resolveOutputMode } from '../output';

export async function handleDocuments(
    command: string | undefined,
    options: Record<string, string | boolean>,
    store: CredentialStore,
) {
    const output = resolveOutputMode(options);
    if (command !== 'import') {
        throw new Error('未知 documents 命令，请使用 ova documents import');
    }

    const action = typeof options._ === 'string' ? options._ : String(options.action ?? 'create');
    if (!options.source && !options.url && options.value && !['status', 'list', 'cancel', 'retry'].includes(action)) {
        options.source = options.value;
    }
    if (action === 'status') {
        await emitStatus(options, store, output);
        return;
    }
    if (action === 'list') {
        const response = await callApi('/api/v1/import-tasks', {}, options, store);
        const items = ((response.data as Record<string, unknown>).items ?? []) as Array<Record<string, unknown>>;
        emitOutput(output, response, () => [`traceId: ${String(response.traceId ?? '')}`, ...items.map(formatTask)].join('\n'), items);
        return;
    }
    if (action === 'cancel' || action === 'retry') {
        const response = await callApi(
            `/api/v1/import-tasks/${encodeURIComponent(String(options.task ?? options.taskId ?? ''))}/${action}`,
            { method: 'POST' },
            options,
            store,
        );
        emitOutput(output, response, () => formatTask((response.data as Record<string, unknown>).item as Record<string, unknown>), [response.data as Record<string, unknown>]);
        return;
    }

    const response = await callApi(
        '/api/v1/import-tasks/documents',
        {
            method: 'POST',
            body: JSON.stringify({
                sourceType: options.sourceType ?? options.type ?? 'url',
                knowledgeBaseId: options.kb ?? options.knowledgeBaseId,
                parentNodeId: options.parent ?? options.parentNodeId,
                sourceUrl: options.source ?? options.url,
                sourceUrls: options.sources ? String(options.sources).split(',') : undefined,
            }),
        },
        options,
        store,
    );
    emitOutput(output, response, () => formatTask((response.data as Record<string, unknown>).item as Record<string, unknown>), [response.data as Record<string, unknown>]);
}

async function emitStatus(
    options: Record<string, string | boolean>,
    store: CredentialStore,
    output: ReturnType<typeof resolveOutputMode>,
) {
    const taskId = encodeURIComponent(String(options.task ?? options.taskId ?? ''));
    const response = await callApi(
        `/api/v1/import-tasks/${taskId}`,
        {},
        options,
        store,
    );
    emitOutput(output, response, () => {
        const data = response.data as Record<string, unknown>;
        return [`traceId: ${String(response.traceId ?? '')}`, `${String(data.taskId)} ${String(data.status)} ${String(data.progress)}%`].join('\n');
    }, [response.data as Record<string, unknown>]);
}

function formatTask(task: Record<string, unknown> | null | undefined) {
    if (!task) return '无任务';
    return `${String(task.id)} ${String(task.status)} ${String(task.sourceType)} -> ${String(task.targetUri)}`;
}
