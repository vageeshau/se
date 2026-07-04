import { useEffect, useState } from 'react';
import { request } from './api';
import type { Agent, SlaStatus, Ticket } from './types';

const STATUS_OPTIONS: { value: Ticket['status']; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const SLA_LABELS: Record<SlaStatus, string> = {
  on_track: 'On track',
  breached: 'Breached',
  met: 'Met SLA',
  none: '—',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function SlaBadge({ status }: { status: SlaStatus }) {
  if (status === 'none') return <span className="muted">—</span>;
  return <span className={`badge sla-${status}`}>{SLA_LABELS[status]}</span>;
}

export function TicketList() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [assignee, setAssignee] = useState('');

  // Agents for the assignee filter — fetched once.
  useEffect(() => {
    request<Agent[]>('/users')
      .then(setAgents)
      .catch(() => setAgents([]));
  }, []);

  // Refetch whenever a filter changes; empty values are omitted so the
  // no-filter case hits the plain /tickets endpoint.
  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (assignee) params.set('assignee', assignee);
    const query = params.toString();

    setTickets(null);
    setError(null);
    request<Ticket[]>(`/tickets${query ? `?${query}` : ''}`)
      .then(setTickets)
      .catch((err: Error) => setError(err.message));
  }, [status, assignee]);

  return (
    <div>
      <div className="filters">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assignee
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">All</option>
            <option value="unassigned">Unassigned</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p className="error">{error}</p>
      ) : !tickets ? (
        <p className="muted">Loading tickets…</p>
      ) : tickets.length === 0 ? (
        <p className="muted">No tickets match these filters.</p>
      ) : (
        <table className="ticket-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Status</th>
              <th>SLA</th>
              <th>Priority</th>
              <th>Assignee</th>
              <th>Comments</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr key={ticket.id}>
                <td>
                  <a href={`#/tickets/${ticket.id}`}>{ticket.subject}</a>
                </td>
                <td>
                  <span className={`badge status-${ticket.status}`}>
                    {ticket.status.replace('_', ' ')}
                  </span>
                </td>
                <td>
                  <SlaBadge status={ticket.slaStatus} />
                </td>
                <td>{ticket.priority}</td>
                <td>{ticket.assigneeName ?? '—'}</td>
                <td>{ticket.commentCount}</td>
                <td>{formatDate(ticket.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
