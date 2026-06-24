export function assertId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('A valid id is required.');
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('A valid id is required.');
  }
  return trimmed;
}
