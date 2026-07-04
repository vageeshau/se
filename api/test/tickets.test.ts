import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server';
import { pool } from '../src/db';
import { ensureTestDatabase, resetDatabase } from './helpers';

const app = buildServer({ logger: false });

beforeAll(async () => {
  await ensureTestDatabase();
  await app.ready();
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('GET /tickets', () => {
  it('returns all tickets with assignee name and comment count', async () => {
    const res = await app.inject({ method: 'GET', url: '/tickets' });

    expect(res.statusCode).toBe(200);
    const tickets = res.json();
    expect(tickets).toHaveLength(3);

    const printer = tickets.find((t: any) => t.subject === 'Printer on fire');
    expect(printer).toMatchObject({
      status: 'open',
      priority: 'urgent',
      assigneeName: 'Ada Fixture',
      commentCount: 2,
      slaHours: 4,
    });
    expect(printer.createdAt).toBeTypeOf('string');

    const unassigned = tickets.find((t: any) => t.subject === 'Unassigned question');
    expect(unassigned.assigneeId).toBeNull();
    expect(unassigned.assigneeName).toBeNull();
    expect(unassigned.commentCount).toBe(0);
  });

  it('includes an SLA status for each ticket', async () => {
    const res = await app.inject({ method: 'GET', url: '/tickets' });
    const tickets = res.json();

    // Created 2h ago with a 4h window -> still on track.
    const printer = tickets.find((t: any) => t.subject === 'Printer on fire');
    expect(printer.slaStatus).toBe('on_track');

    // Created 2 days ago with a 24h window, still unresolved -> breached.
    const slow = tickets.find((t: any) => t.subject === 'Slow reports page');
    expect(slow.slaStatus).toBe('breached');
  });
});

describe('GET /tickets with filters', () => {
  it('filters by status', async () => {
    const res = await app.inject({ method: 'GET', url: '/tickets?status=in_progress' });

    expect(res.statusCode).toBe(200);
    const tickets = res.json();
    expect(tickets).toHaveLength(1);
    expect(tickets[0].subject).toBe('Slow reports page');
  });

  it('filters by assignee', async () => {
    const res = await app.inject({ method: 'GET', url: '/tickets?assignee=1' });

    expect(res.statusCode).toBe(200);
    const tickets = res.json();
    expect(tickets).toHaveLength(1);
    expect(tickets[0].subject).toBe('Printer on fire');
  });

  it('combines status and assignee filters', async () => {
    // Ada (assignee 1) owns an open ticket, so this matches it.
    const match = await app.inject({
      method: 'GET',
      url: '/tickets?status=open&assignee=1',
    });
    expect(match.json()).toHaveLength(1);
    expect(match.json()[0].subject).toBe('Printer on fire');

    // Grace (assignee 2) owns an in_progress ticket, so open+2 matches nothing.
    const none = await app.inject({
      method: 'GET',
      url: '/tickets?status=open&assignee=2',
    });
    expect(none.json()).toHaveLength(0);
  });

  it('filters to unassigned tickets', async () => {
    const res = await app.inject({ method: 'GET', url: '/tickets?assignee=unassigned' });

    expect(res.statusCode).toBe(200);
    const tickets = res.json();
    expect(tickets).toHaveLength(1);
    expect(tickets[0].subject).toBe('Unassigned question');
    expect(tickets[0].assigneeId).toBeNull();
  });

  it('rejects an unknown status value', async () => {
    const res = await app.inject({ method: 'GET', url: '/tickets?status=archived' });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /users', () => {
  it('lists agents ordered by name', async () => {
    const res = await app.inject({ method: 'GET', url: '/users' });

    expect(res.statusCode).toBe(200);
    const users = res.json();
    expect(users).toHaveLength(2);
    expect(users.map((u: any) => u.name)).toEqual(['Ada Fixture', 'Grace Fixture']);
    expect(users[0]).toMatchObject({ id: expect.any(Number), name: 'Ada Fixture' });
  });
});

describe('GET /tickets/:id', () => {
  it('returns the ticket with its comments', async () => {
    const res = await app.inject({ method: 'GET', url: '/tickets/1' });

    expect(res.statusCode).toBe(200);
    const ticket = res.json();
    expect(ticket.subject).toBe('Printer on fire');
    expect(ticket.comments).toHaveLength(2);
    expect(ticket.comments[0]).toMatchObject({
      ticketId: 1,
      authorName: 'Grace Fixture',
      body: 'Extinguisher deployed, assessing damage.',
    });
  });

  it('returns 404 for an unknown ticket', async () => {
    const res = await app.inject({ method: 'GET', url: '/tickets/999' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Ticket 999 not found' });
  });
});

describe('POST /tickets', () => {
  it('creates a ticket with defaults applied', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tickets',
      payload: {
        subject: 'Keyboard missing keys',
        description: 'The E and R keys have vanished.',
      },
    });

    expect(res.statusCode).toBe(201);
    const ticket = res.json();
    expect(ticket).toMatchObject({
      subject: 'Keyboard missing keys',
      status: 'open',
      priority: 'medium',
      assigneeId: null,
      assigneeName: null,
      slaHours: 8,
      commentCount: 0,
      resolvedAt: null,
    });
  });

  it('rejects an invalid payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tickets',
      payload: { subject: '' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Validation failed');
  });
});

describe('PATCH /tickets/:id/status', () => {
  it('updates the status and returns the ticket', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/tickets/1/status',
      payload: { status: 'in_progress' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('in_progress');
  });

  it('rejects an unknown status value', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/tickets/1/status',
      payload: { status: 'archived' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('clears resolved_at when a ticket is reopened', async () => {
    // Resolve it (stamps resolved_at)...
    const resolved = await app.inject({
      method: 'PATCH',
      url: '/tickets/1/status',
      payload: { status: 'resolved' },
    });
    expect(resolved.json().resolvedAt).not.toBeNull();

    // ...then reopen it: resolved_at must be cleared so SLA judges it live.
    const reopened = await app.inject({
      method: 'PATCH',
      url: '/tickets/1/status',
      payload: { status: 'in_progress' },
    });
    expect(reopened.json().status).toBe('in_progress');
    expect(reopened.json().resolvedAt).toBeNull();
  });
});
