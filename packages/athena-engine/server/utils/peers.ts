// Shared peer count — updated by _ws.ts, read by health endpoint
let activePeerCount = 0;

export function setActivePeerCount(count: number): void {
  activePeerCount = count;
}

export function getActivePeerCount(): number {
  return activePeerCount;
}
