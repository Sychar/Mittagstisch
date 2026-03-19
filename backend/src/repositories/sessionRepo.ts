import { Session } from "../types";

export interface SessionRepo {
  create(session: Session): Session;
  findByToken(token: string): Session | undefined;
  touch(token: string): Session | undefined;
}

export class InMemorySessionRepo implements SessionRepo {
  private items = new Map<string, Session>();

  create(session: Session): Session {
    this.items.set(session.token, session);
    return session;
  }

  findByToken(token: string): Session | undefined {
    return this.items.get(token);
  }

  touch(token: string): Session | undefined {
    const current = this.items.get(token);
    if (!current) return undefined;
    const next: Session = { ...current, lastSeenAt: new Date().toISOString() };
    this.items.set(token, next);
    return next;
  }
}