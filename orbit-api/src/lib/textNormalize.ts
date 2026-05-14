/**
 * Trim, MAYÚSCULAS y sin marcas diacríticas combinantes (á→A, ñ→N).
 */
export function toUpperAscii(input: string): string {
  const t = input.trim();
  if (t === "") return "";
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export function toUpperAsciiOrNull(
  input: string | null | undefined
): string | null {
  if (input == null) return null;
  const out = toUpperAscii(String(input));
  return out === "" ? null : out;
}
