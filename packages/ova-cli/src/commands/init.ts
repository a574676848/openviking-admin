import type { CredentialStore } from '../state-store';
import { emitInitSummary, runInit } from '../setup-support';

export async function handleInit(
    options: Record<string, string | boolean>,
    store: CredentialStore,
) {
    const summary = await runInit(options, store);
    emitInitSummary(options, summary);
}