import { describe, expect, it } from 'vitest';
import { planLegacyDemoTurn } from '@/src/domain/demo-turn-backfill';

const createdAt = new Date('2026-10-01T09:00:00.000Z');

describe('legacy demo turn backfill planning', () => {
  it('creates a finished turn when completion evidence is present', () => {
    const plan = planLegacyDemoTurn({
      appointmentStatus: 'COMPLETED',
      serviceStatus: 'COMPLETED',
      assignedStaffId: 'staff-1',
      createdAt,
      completedAt: new Date('2026-10-01T10:00:00.000Z'),
      cancelledAt: null,
    });

    expect(plan).toMatchObject({
      status: 'FINISHED',
      eventType: 'FINISHED',
      assignedStaffId: 'staff-1',
      reason: 'Legacy demo turn backfill',
    });
  });

  it('creates a skipped turn when a completed record has no evidence', () => {
    const plan = planLegacyDemoTurn({
      appointmentStatus: 'COMPLETED',
      serviceStatus: 'COMPLETED',
      assignedStaffId: null,
      createdAt,
      completedAt: null,
      cancelledAt: null,
    });

    expect(plan).toMatchObject({
      status: 'SKIPPED',
      eventType: 'SKIPPED',
      endedAt: createdAt,
    });
  });

  it('creates a cancelled/skipped turn for a cancelled demo service', () => {
    const plan = planLegacyDemoTurn({
      appointmentStatus: 'CANCELLED',
      serviceStatus: 'CANCELLED',
      assignedStaffId: 'staff-2',
      createdAt,
      completedAt: null,
      cancelledAt: new Date('2026-10-01T09:15:00.000Z'),
    });

    expect(plan).toMatchObject({
      status: 'SKIPPED',
      eventType: 'CANCELLED',
      assignedStaffId: 'staff-2',
    });
  });

  it('keeps active demo services visible as accepted or waiting', () => {
    expect(
      planLegacyDemoTurn({
        appointmentStatus: 'IN_SERVICE',
        serviceStatus: 'IN_SERVICE',
        assignedStaffId: 'staff-3',
        createdAt,
        completedAt: null,
        cancelledAt: null,
      }),
    ).toMatchObject({ status: 'ACCEPTED', eventType: 'ACCEPTED' });

    expect(
      planLegacyDemoTurn({
        appointmentStatus: 'WAITING',
        serviceStatus: 'WAITING',
        assignedStaffId: null,
        createdAt,
        completedAt: null,
        cancelledAt: null,
      }),
    ).toMatchObject({ status: 'ASSIGNED', eventType: 'WAITING' });
  });
});
