import type { AssignmentResult, StaffCandidate } from './types';

type RequiredSkills = string | string[];

function normalizeRequiredSkills(requiredSkills: RequiredSkills) {
  return Array.isArray(requiredSkills) ? requiredSkills : [requiredSkills];
}

export function getEligibleStaff(staff: StaffCandidate[], requiredSkills: RequiredSkills, excludedIds: string[] = []) {
  const excluded = new Set(excludedIds);
  const required = normalizeRequiredSkills(requiredSkills);
  if (!required.length) return [];
  return staff.filter(
    (candidate) =>
      candidate.isActive &&
      candidate.isPresent &&
      candidate.availability === 'AVAILABLE' &&
      required.every((skill) => candidate.skills.includes(skill)) &&
      !excluded.has(candidate.id),
  );
}

/** Fairness rule: never served first, then longest time since last finished service. */
export function selectFairStaff(staff: StaffCandidate[]): StaffCandidate | null {
  if (staff.length === 0) return null;
  return [...staff].sort((left, right) => {
    const leftFinished = left.lastServiceFinishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    const rightFinished = right.lastServiceFinishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (leftFinished !== rightFinished) return leftFinished - rightFinished;

    const leftAssigned = left.lastAssignedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    const rightAssigned = right.lastAssignedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (leftAssigned !== rightAssigned) return leftAssigned - rightAssigned;
    return left.id.localeCompare(right.id);
  })[0];
}

export function routeNextTurn(staff: StaffCandidate[], requiredSkills: RequiredSkills, excludedIds: string[] = [], roundRobinEnabled = true): AssignmentResult {
  const eligible = getEligibleStaff(staff, requiredSkills, excludedIds);
  const selected = roundRobinEnabled
    ? selectFairStaff(eligible)
    : [...eligible].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))[0] ?? null;
  return selected ? { status: 'ASSIGNED', staff: selected } : { status: 'WAITING', staff: null };
}

export function routeAfterSkip(staff: StaffCandidate[], requiredSkills: RequiredSkills, skippedStaffId: string, roundRobinEnabled = true) {
  return routeNextTurn(staff, requiredSkills, [skippedStaffId], roundRobinEnabled);
}

export function compareFairnessOrder(left: StaffCandidate, right: StaffCandidate) {
  return selectFairStaff([left, right])?.id === left.id ? -1 : 1;
}
