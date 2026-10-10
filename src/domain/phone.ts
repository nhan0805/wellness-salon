/**
 * Keep the customer identity stable when a guest types the same phone number
 * with spaces, punctuation, or an international prefix marker.
 *
 * The display value remains untouched; this value is only used for matching.
 */
export function normalizePhoneNumber(value: string) {
  return value.replace(/\D/g, '');
}
