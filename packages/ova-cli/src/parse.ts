export interface ParsedArgs {
    group?: string;
    command?: string;
    options: Record<string, string | boolean>;
}

export function parseOptions(argv: string[]): ParsedArgs {
    const [group, maybeCommand, ...restArgs] = argv;
    const command = maybeCommand?.startsWith('--') ? undefined : maybeCommand;
    const rest = command ? restArgs : ([maybeCommand, ...restArgs].filter(Boolean) as string[]);
    const options: Record<string, string | boolean> = {};
    const positional: string[] = [];

    for (let index = 0; index < rest.length; index += 1) {
        const current = rest[index];
        if (!current.startsWith('--')) {
            positional.push(current);
            continue;
        }

        const key = current.replace(/^--/, '');
        const next = rest[index + 1];
        if (!next || next.startsWith('--')) {
            options[key] = true;
            continue;
        }

        options[key] = next;
        index += 1;
    }

    if (positional[0]) {
        options._ = positional[0];
    }
    if (positional[1]) {
        options.value = positional[1];
    }

    return {
        group,
        command,
        options,
    };
}
