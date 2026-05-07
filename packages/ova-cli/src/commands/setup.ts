import type { CredentialStore } from '../state-store';
import { emitSetupSummary, runSetup } from '../setup-support';

export async function handleSetup(
    options: Record<string, string | boolean>,
    store: CredentialStore,
) {
    const summary = await runSetup(options, store);
    emitSetupSummary(options, summary);
}