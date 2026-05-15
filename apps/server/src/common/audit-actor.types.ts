export interface AuditActorSnapshot {
  id: string | null;
  username: string | null;
}

export interface AuditActorSource {
  id?: string | null;
  userId?: string | null;
  username?: string | null;
}

export interface AuditActorColumns {
  createdById?: string | null;
  createdByName?: string | null;
  updatedById?: string | null;
  updatedByName?: string | null;
}

export function createAuditActorSnapshot(
  source: AuditActorSource | null | undefined,
): AuditActorSnapshot {
  return {
    id: source?.id ?? source?.userId ?? null,
    username: source?.username ?? null,
  };
}

export function applyCreatedAuditActor<T extends object>(
  target: T,
  actor: AuditActorSnapshot | null | undefined,
): T & AuditActorColumns {
  if (!actor) {
    return target;
  }

  return {
    ...target,
    createdById: actor.id,
    createdByName: actor.username,
    updatedById: actor.id,
    updatedByName: actor.username,
  };
}

export function applyUpdatedAuditActor<T extends object>(
  target: T,
  actor: AuditActorSnapshot | null | undefined,
): T & AuditActorColumns {
  if (!actor) {
    return target;
  }

  return {
    ...target,
    updatedById: actor.id,
    updatedByName: actor.username,
  };
}
