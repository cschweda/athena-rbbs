export function hostnameToPhoneNumber(host: string): string {
  // Deterministic phone number from hostname
  let hash = 0;
  for (let i = 0; i < host.length; i++) {
    hash = ((hash << 5) - hash + host.charCodeAt(i)) | 0;
  }
  // Ensure positive
  hash = Math.abs(hash);

  const area = 200 + (hash % 800);
  const prefix = 200 + ((hash >> 10) % 800);
  const line = 1000 + ((hash >> 20) % 9000);

  return `(${area}) ${prefix}-${line}`;
}
