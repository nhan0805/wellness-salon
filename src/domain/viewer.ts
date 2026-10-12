export type ViewerRole = 'ADMIN' | 'STATION';

export type AccountViewer = {
  role: ViewerRole;
  email: string;
  displayName: string;
  initials: string;
};

export function makeAccountViewer(input: {
  email?: string | null;
  displayName?: string | null;
  role?: ViewerRole | null;
}): AccountViewer | null {
  if (!input.role) return null;

  const fallbackName = input.role === 'ADMIN' ? 'Administrator' : 'Station account';

  return {
    role: input.role,
    email: input.email?.trim() ?? '',
    displayName: input.displayName?.trim() || fallbackName,
    initials: input.role === 'ADMIN' ? 'A' : 'S',
  };
}
