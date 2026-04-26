import { Injectable, MessageEvent } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { McpSessionService } from './mcp-session.service';

const MCP_SSE_POLL_INTERVAL_MS = 1000;

@Injectable()
export class McpSseService {
  constructor(private readonly mcpSessionService: McpSessionService) {}

  createEventStream(
    req: Request,
    session: { sessionId: string; endpoint: string },
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let polling = false;

      const flushEvents = async () => {
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
              type: event.type,
            });
          }
          await this.mcpSessionService.touchSession(session.sessionId);
        } finally {
          polling = false;
        }
      };

      subscriber.next({
        data: session.endpoint,
        type: 'endpoint',
      });

      const timer = setInterval(() => {
        void flushEvents();
      }, MCP_SSE_POLL_INTERVAL_MS);

      void flushEvents();

      const cleanup = () => {
        clearInterval(timer);
        void this.mcpSessionService.closeSession(session.sessionId);
        subscriber.complete();
      };

      req.on('close', cleanup);
      req.on('end', cleanup);

      return cleanup;
    });
  }
}
