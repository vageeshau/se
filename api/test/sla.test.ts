import { describe, expect, it } from 'vitest';
import { computeSlaStatus } from '../src/sla';

// Fixed reference point so the "now" comparisons are deterministic.
const now = new Date('2026-07-04T12:00:00Z');
const hoursBefore = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

describe('computeSlaStatus', () => {
  it('is on_track when an unresolved ticket is still within its window', () => {
    // Created 1h ago, 4h window -> deadline 3h from now.
    const status = computeSlaStatus(
      { createdAt: hoursBefore(1), slaHours: 4, resolvedAt: null, status: 'open' },
      now
    );
    expect(status).toBe('on_track');
  });

  it('is breached when an unresolved ticket is past its deadline', () => {
    // Created 6h ago, 4h window -> deadline 2h ago, still open.
    const status = computeSlaStatus(
      { createdAt: hoursBefore(6), slaHours: 4, resolvedAt: null, status: 'in_progress' },
      now
    );
    expect(status).toBe('breached');
  });

  it('is met when resolved on or before the deadline', () => {
    // Created 6h ago, 4h window -> deadline 2h ago; resolved 3h ago (in time).
    const status = computeSlaStatus(
      {
        createdAt: hoursBefore(6),
        slaHours: 4,
        resolvedAt: hoursBefore(3),
        status: 'resolved',
      },
      now
    );
    expect(status).toBe('met');
  });

  it('is breached when resolved after the deadline', () => {
    // Created 6h ago, 4h window -> deadline 2h ago; resolved 1h ago (late).
    const status = computeSlaStatus(
      {
        createdAt: hoursBefore(6),
        slaHours: 4,
        resolvedAt: hoursBefore(1),
        status: 'resolved',
      },
      now
    );
    expect(status).toBe('breached');
  });

  it('judges a reopened ticket live, ignoring a stale resolvedAt', () => {
    // Was resolved in time, then reopened -> resolvedAt is now stale. Because
    // the status is active and the deadline has passed, it must read as
    // breached, not a frozen 'met'.
    const status = computeSlaStatus(
      {
        createdAt: hoursBefore(6),
        slaHours: 4,
        resolvedAt: hoursBefore(5),
        status: 'in_progress',
      },
      now
    );
    expect(status).toBe('breached');
  });

  it('is none for a closed ticket that was never resolved', () => {
    // Past its deadline, but closed without a resolution time -> not judged.
    const status = computeSlaStatus(
      { createdAt: hoursBefore(48), slaHours: 4, resolvedAt: null, status: 'closed' },
      now
    );
    expect(status).toBe('none');
  });

  it('treats landing exactly on the deadline as within SLA', () => {
    // Unresolved, now === deadline.
    const onTrack = computeSlaStatus(
      { createdAt: hoursBefore(4), slaHours: 4, resolvedAt: null, status: 'open' },
      now
    );
    expect(onTrack).toBe('on_track');

    // Resolved exactly on the deadline.
    const met = computeSlaStatus(
      {
        createdAt: hoursBefore(4),
        slaHours: 4,
        resolvedAt: now,
        status: 'resolved',
      },
      now
    );
    expect(met).toBe('met');
  });
});
