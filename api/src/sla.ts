// SLA status derivation. Kept as a pure, framework-free function so the rule
// lives in one place and is unit-testable without a database or HTTP layer.
//
// A ticket must be resolved within `slaHours` of being created:
//   deadline = createdAt + slaHours
//
//   - resolved / closed: judged on when it was actually resolved — met if
//     resolved on or before the deadline, otherwise breached (resolved late).
//     A historical breach is therefore preserved after resolution, and closed
//     tickets that were never resolved ('none') aren't judged at all.
//   - open / in_progress: judged live — on_track while now is on or before the
//     deadline, otherwise breached.
//
// The branch keys off `status`, not the presence of `resolvedAt`. A ticket that
// was resolved and then reopened keeps its old `resolvedAt` (see the seed data
// and the updateStatus fix), and such an active ticket must be judged live
// against its deadline, not frozen on the stale timestamp.
//
// The deadline boundary is inclusive: landing exactly on the deadline counts as
// within SLA.

export type SlaStatus = 'on_track' | 'breached' | 'met' | 'none';

export interface SlaInput {
  createdAt: Date;
  slaHours: number;
  resolvedAt: Date | null;
  status: string;
}

const HOUR_MS = 60 * 60 * 1000;

export function computeSlaStatus(input: SlaInput, now: Date = new Date()): SlaStatus {
  const deadline = new Date(input.createdAt.getTime() + input.slaHours * HOUR_MS);

  if (input.status === 'resolved' || input.status === 'closed') {
    if (!input.resolvedAt) {
      return 'none';
    }
    return input.resolvedAt <= deadline ? 'met' : 'breached';
  }

  return now <= deadline ? 'on_track' : 'breached';
}
