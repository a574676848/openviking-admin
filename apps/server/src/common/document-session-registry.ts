import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export type DocumentSessionMode = 'readonly' | 'write';

export interface DocumentSessionInfo {
  kbId: string;
  mode: DocumentSessionMode;
}

const DOCUMENT_SESSION_LOCK_MESSAGES = {
  WRITE_LOCKED: '目标节点正在被协作编辑',
  TREE_LOCKED: '目标节点或子节点正在被协作编辑',
} as const;

@Injectable()
export class DocumentSessionRegistry {
  private readonly nodeSessions = new Map<
    string,
    Map<string, DocumentSessionInfo>
  >();
  private readonly kbNodes = new Map<string, Set<string>>();

  register(
    kbId: string,
    nodeId: string,
    connectionId: string,
    mode: DocumentSessionMode,
  ): void {
    const sessions = this.nodeSessions.get(nodeId) ?? new Map();
    sessions.set(connectionId, { kbId, mode });
    this.nodeSessions.set(nodeId, sessions);

    const nodes = this.kbNodes.get(kbId) ?? new Set();
    nodes.add(nodeId);
    this.kbNodes.set(kbId, nodes);
  }

  unregister(kbId: string, nodeId: string, connectionId: string): void {
    const sessions = this.nodeSessions.get(nodeId);
    if (!sessions) {
      return;
    }

    sessions.delete(connectionId);
    if (sessions.size > 0) {
      return;
    }

    this.nodeSessions.delete(nodeId);
    this.removeKbNode(kbId, nodeId);
  }

  hasActiveSession(nodeId: string): boolean {
    return (this.nodeSessions.get(nodeId)?.size ?? 0) > 0;
  }

  hasActiveWriteSession(nodeId: string): boolean {
    const sessions = this.nodeSessions.get(nodeId);
    if (!sessions) {
      return false;
    }

    return Array.from(sessions.values()).some(
      (session) => session.mode === 'write',
    );
  }

  hasActiveSessionInKb(kbId: string): boolean {
    return (this.kbNodes.get(kbId)?.size ?? 0) > 0;
  }

  assertNoActiveWriteSession(nodeId: string): void {
    if (!this.hasActiveWriteSession(nodeId)) {
      return;
    }

    throw new HttpException(
      DOCUMENT_SESSION_LOCK_MESSAGES.WRITE_LOCKED,
      HttpStatus.LOCKED,
    );
  }

  assertNoActiveSessionInNodes(nodeIds: string[]): void {
    if (!nodeIds.some((nodeId) => this.hasActiveSession(nodeId))) {
      return;
    }

    throw new HttpException(
      DOCUMENT_SESSION_LOCK_MESSAGES.TREE_LOCKED,
      HttpStatus.LOCKED,
    );
  }

  private removeKbNode(kbId: string, nodeId: string): void {
    const nodes = this.kbNodes.get(kbId);
    if (!nodes) {
      return;
    }

    nodes.delete(nodeId);
    if (nodes.size === 0) {
      this.kbNodes.delete(kbId);
    }
  }
}
