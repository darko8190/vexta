/**
 * A file's weight in the units a person reads, French abbreviations included.
 *
 * Shared by the list and the upload panel so a file does not weigh "1.4 Mo" in one and
 * "1 433 Ko" in the other for the same bytes.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
