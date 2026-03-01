export function hostnameToNodeAddress(host: string): string {
  // Deterministic node address from hostname
  let hash = 0;
  for (let i = 0; i < host.length; i++) {
    hash = ((hash << 5) - hash + host.charCodeAt(i)) | 0;
  }
  hash = Math.abs(hash);

  // Generate a hex node address like "NODE::A3F2:B801"
  const seg1 = ((hash >> 0) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  const seg2 = ((hash >> 16) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');

  return `NODE::${seg1}:${seg2}`;
}
