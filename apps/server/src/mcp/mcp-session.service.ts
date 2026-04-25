import { createHash, randomBytes, randomUUID } from 'crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';
import { McpSession } from './entities/mcp-session.entity';
import { McpSessionEvent } from './entities/mcp-session-event.entity';

type PendingEvent = {
  id: string;
  type?: string;
  payload: string;
};

const SESSION_TTL_MS = 30 * 60 * 1000;
const EVENT_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class McpSessionService {
  constructor(
    @InjectRepository(McpSession)
    private readonly sessionRepo: Repository<McpSession>,
    @InjectRepository(McpSessionEvent)
    private readonly eventRepo: Repository<McpSessionEvent>,
  ) {}

  async createSession(
    credential: string,
    credentialQueryName: 'key' | 'sessionKey' = 'key',
  ) {
    await this.cleanupExpiredRecords();

    const sessionId = randomUUID();
    const sessionToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.sessionRepo.save(
        this.sessionRepo.create({
        sessionId,
        credentialHash: this.hashValue(credential),
        sessionTokenHash: this.hashValue(sessionToken),
        expiresAt,
        lastSeenAt: new Date(),
        closedAt: null,
      }),
    );

    return {
      sessionId,
      sessionToken,
      endpoint: `/api/mcp/message?sessionId=${sessionId}&sessionToken=${sessionToken}&${credentialQueryName}=${encodeURIComponent(credential)}`,
    };
  }

  async validateSession(
    sessionId: string,
    credential: string,
    sessionToken: string,
  ) {
    const session = await this.sessionRepo.findOne({
      where: {
        sessionId,
        credentialHash: this.hashValue(credential),
        sessionTokenHash: this.hashValue(sessionToken),
        closedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });

    if (!session) {
      throw new UnauthorizedException('会话已失效或不存在');
    }

    await this.touchSession(sessionId);
    return session;
  }

  async touchSession(sessionId: string) {
    await this.sessionRepo.update(sessionId, {
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
  }

  async closeSession(sessionId: string) {
    await this.sessionRepo.update(sessionId, {
      closedAt: new Date(),
    });
  }

  async enqueueEvent(sessionId: string, payload: string, eventType?: string) {
    await this.eventRepo.save(
      this.eventRepo.create({
        sessionId,
        eventType: eventType ?? null,
        payload,
        deliveredAt: null,
        expiresAt: new Date(Date.now() + EVENT_TTL_MS),
      }),
    );
  }

  async pullPendingEvents(sessionId: string): Promise<PendingEvent[]> {
    const events = await this.eventRepo.find({
      where: {
        sessionId,
        deliveredAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'ASC' },
      take: 50,
    });

    if (events.length === 0) {
      return [];
    }

    const deliveredAt = new Date();
    await this.eventRepo.update(
      events.map((event) => event.id),
      { deliveredAt },
    );

    return events.map((event) => ({
      id: event.id,
      type: event.eventType ?? undefined,
      payload: event.payload,
    }));
  }

  private async cleanupExpiredRecords() {
    const now = new Date();
    await this.eventRepo.delete([
      { expiresAt: LessThan(now) },
      { deliveredAt: LessThan(new Date(now.getTime() - EVENT_TTL_MS)) },
    ]);
    await this.sessionRepo.delete([
      { expiresAt: LessThan(now) },
      { closedAt: LessThan(new Date(now.getTime() - EVENT_TTL_MS)) },
    ]);
  }

  private hashValue(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
