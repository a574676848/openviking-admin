export type OutputMode = 'text' | 'json' | 'jsonl';

export function resolveOutputMode(options: Record<string, string | boolean>): OutputMode {
    if (options.output === 'json') {
        return 'json';
    }
    if (options.output === 'jsonl') {
        return 'jsonl';
    }
    return 'text';
}

export function printJson(payload: unknown) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export function printJsonl(records: Array<Record<string, unknown>>) {
    process.stdout.write(`${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
}

export function printText(value: string) {
    process.stdout.write(`${value}\n`);
}

export function emitOutput(
    mode: OutputMode,
    payload: unknown,
    renderText: () => string,
    jsonlRecords?: Array<Record<string, unknown>>,
) {
    if (mode === 'json') {
        printJson(payload);
        return;
    }

    if (mode === 'jsonl') {
        printJsonl(jsonlRecords ?? [{ data: payload as Record<string, unknown> }]);
        return;
    }

    printText(renderText());
}
