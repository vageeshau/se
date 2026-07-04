import { pool } from '../db';
import { toTicketDto, type TicketDto, type TicketRow } from '../mappers';
import * as usersRepository from '../users/users.repository';

export interface ListTicketsFilters {
  status?: string;
  assigneeId?: number;
  unassigned?: boolean;
}

export async function listTickets(
  filters: ListTicketsFilters = {}
): Promise<TicketDto[]> {
  // Build the WHERE clause from only the filters that are present, so the
  // no-filter case is unchanged. Values go through parameter placeholders.
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status !== undefined) {
    params.push(filters.status);
    conditions.push(`t.status = $${params.length}`);
  }
  if (filters.unassigned) {
    conditions.push('t.assignee_id is null');
  } else if (filters.assigneeId !== undefined) {
    params.push(filters.assigneeId);
    conditions.push(`t.assignee_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';

  // Single joined query (assignee name + comment count) rather than a per-row
  // lookup, matching getTicketById and avoiding the previous N+1.
  const { rows } = await pool.query(
    `select t.*, u.name as assignee_name,
            (select count(*) from comments c where c.ticket_id = t.id) as comment_count
       from tickets t
       left join users u on u.id = t.assignee_id
       ${where}
      order by t.created_at desc`,
    params
  );

  return rows.map((row) =>
    toTicketDto(row, row.assignee_name ?? null, Number(row.comment_count))
  );
}

export async function getTicketById(id: number): Promise<TicketDto | null> {
  const { rows } = await pool.query(
    `select t.*, u.name as assignee_name,
            (select count(*) from comments c where c.ticket_id = t.id) as comment_count
       from tickets t
       left join users u on u.id = t.assignee_id
      where t.id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return toTicketDto(row, row.assignee_name ?? null, Number(row.comment_count));
}

export interface CreateTicketInput {
  subject: string;
  description: string;
  priority: string;
  assigneeId: number | null;
  slaHours: number;
}

export async function createTicket(input: CreateTicketInput): Promise<TicketDto> {
  const { rows } = await pool.query<TicketRow>(
    `insert into tickets (subject, description, status, priority, assignee_id, sla_hours)
     values ($1, $2, 'open', $3, $4, $5)
     returning *`,
    [input.subject, input.description, input.priority, input.assigneeId, input.slaHours]
  );
  const row = rows[0];
  const assigneeName = row.assignee_id
    ? await usersRepository.findNameById(row.assignee_id)
    : null;
  return toTicketDto(row, assigneeName, 0);
}

export async function updateStatus(id: number, status: string): Promise<void> {
  if (status === 'resolved') {
    // Mark resolved: stamp the resolution time.
    await pool.query(
      'update tickets set status = $1, resolved_at = now(), updated_at = now() where id = $2',
      [status, id]
    );
  } else if (status === 'closed') {
    // Closing keeps resolved_at — a ticket may have been resolved before it was
    // closed, and that resolution time still matters for SLA/reporting.
    await pool.query(
      'update tickets set status = $1, updated_at = now() where id = $2',
      [status, id]
    );
  } else {
    // Reopening (open / in_progress): drop the stale resolution time so SLA and
    // reporting treat the ticket as active again.
    await pool.query(
      'update tickets set status = $1, resolved_at = null, updated_at = now() where id = $2',
      [status, id]
    );
  }
}
