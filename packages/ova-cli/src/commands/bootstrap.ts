import type { CredentialStore } from '../state-store';
import { handleConfigure } from './configure';
import {
    emitBootstrapSummary,
    profileHasBootstrapCredential,
    runInit,
    runSetup,
    shouldRunInit,
    shouldRunSetup,
} from '../setup-support';
import { readProfile } from '../state-store';

export async function handleBootstrap(
    options: Record<string, string | boolean>,
    store: CredentialStore,
) {
    const profileContext = readProfile(store, options);
    if (!profileHasBootstrapCredential(profileContext.profile)) {
        await handleConfigure(options, store);
    }

    const setupSummary = shouldRunSetup(options) ? await runSetup(options, store) : null;
    const initSummary = shouldRunInit(options) ? await runInit(options, store) : null;

    emitBootstrapSummary(options, {
        setup: setupSummary,
        init: initSummary,
    });
}