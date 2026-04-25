import { Injectable, UnauthorizedException } from '@nestjs/common';

type SsoExchangePayload = {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds?: number;
  refreshExpiresInSeconds?: number;
  user: {
    id: string;
    username: string;
    role: string;
    tenantId: string | null;
  };
};

@Injectable()
export class SsoTicketService {
  private readonly tickets = new Map<
    string,
    { payload: SsoExchangePayload; expiresAt: number }
  >();

  create(payload: SsoExchangePayload) {
    const ticket = crypto.randomUUID();
    this.tickets.set(ticket, {
      payload,
      expiresAt: Date.now() + 60_000,
    });
    return ticket;
  }

  consume(ticket: string) {
    const entry = this.tickets.get(ticket);
    if (!entry || entry.expiresAt < Date.now()) {
      this.tickets.delete(ticket);
      throw new UnauthorizedException('SSO ticket 已失效');
    }
    this.tickets.delete(ticket);
    return entry.payload;
  }
}
