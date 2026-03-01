let debugEnabled = true;
let initialized = false;

export function setDebugEnabled(enabled: boolean) {
  debugEnabled = enabled;
  initialized = true;
}

export function useDebugLog(component: string) {
  const prefix = `[Athena:${component}]`;

  function debug(...args: unknown[]) {
    if (!debugEnabled) return;
    console.log(prefix, ...args);
  }

  return { debug };
}
