import { Injectable, MessageEvent } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { McpSessionService } from './mcp-session.service';

const MCP_SSE_POLL_INTERVAL_MS = 1000;
const SSE_CONTENT_TYPE = 'text/event-stream; charset=utf-8';
const SSE_CACHE_CONTROL = 'no-cache, no-transform';
const SSE_CONNECTION = 'keep-alive';

@Injectable()
export class McpSseService {
  constructor(private readonly mcpSessionService: McpSessionService) {}

  writeEventStream(
    req: Request,
    res: Response,
    session: { sessionId: string; endpoint: string },
  ) {
    res.setHeader('Content-Type', SSE_CONTENT_TYPE);
    res.setHeader('Cache-Control', SSE_CACHE_CONTROL);
    res.setHeader('Connection', SSE_CONNECTION);
    res.flushHeaders?.();

    const subscription = this.createEventStream(req, async () => session).subscribe({
      next: (event) => {
        res.write(this.formatSseEvent(event));
      },
      complete: () => {
        res.end();
      },
      error: () => {
        res.end();
      },
    });

    req.on('close', () => {
      subscription.unsubscribe();
    });
  }

  createEventStream(
    req: Request,
    resolveSession: () => Promise<{ sessionId: string; endpoint: string }>,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let polling = false;
      let session: { sessionId: string; endpoint: string } | null = null;

      const flushEvents = async () => {
        if (!session) {
          return;
        }
        if (polling) {
          return;
        }

        polling = true;
        try {
          const events = await this.mcpSessionService.pullPendingEvents(
            session.sessionId,
          );
          for (const event of events) {
            subscriber.next({
              data: event.payload,
              type: event.type ?? 'message',
            });
          }
          await this.mcpSessionService.touchSession(session.sessionId);
        } finally {
          polling = false;
        }
      };

      const timer = setInterval(() => {
        void flushEvents();
      }, MCP_SSE_POLL_INTERVAL_MS);

      void resolveSession()
        .then((resolvedSession) => {
          session = resolvedSession;
          subscriber.next({
            data: resolvedSession.endpoint,
            type: 'endpoint',
          });
          void flushEvents();
        })
        .catch((error: unknown) => {
          subscriber.next({
            data: error instanceof Error ? error.message : 'MCP 会话创建失败',
            type: 'error',
          });
          subscriber.complete();
        });

      const cleanup = () => {
        clearInterval(timer);
        if (session) {
          void this.mcpSessionService.closeSession(session.sessionId);
        }
        subscriber.complete();
      };

      req.on('close', cleanup);

      return cleanup;
    });
  }

  private formatSseEvent(event: MessageEvent) {
    const lines: string[] = [];
    if (event.type) {
      lines.push(`event: ${event.type}`);
    }
    if (event.id) {
      lines.push(`id: ${event.id}`);
    }
    lines.push(`data: ${String(event.data).replace(/\r?\n/g, '\ndata: ')}`);
    return `${lines.join('\n')}\n\n`;
  }
}
