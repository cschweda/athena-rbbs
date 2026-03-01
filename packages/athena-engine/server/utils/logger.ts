export type LogEvent =
  | 'connect'
  | 'disconnect'
  | 'auth.success'
  | 'auth.failure'
  | 'auth.timeout'
  | 'auth.banned'
  | 'rate_limit'
  | 'connection_rate_limit'
  | 'ws.error'
  | 'ws.oversized'
  | 'session.timeout'
  | 'session.takeover'
  | 'sysop.action'
  | 'sysop.broadcast'
  | 'ban.sysop'
  | 'ban.admin'
  | 'kick.sysop'
  | 'kick.admin'
  | 'unban'
  | 'game.error'
  | 'gopher.fetch'
  | 'gopher.error'
  | 'startup'
  | 'shutdown';

interface LogEntry {
  timestamp: string;
  event: LogEvent;
  [key: string]: unknown;
}

export function log(event: LogEvent, data: Record<string, unknown> = {}): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    event,
    ...data,
  };
  process.stdout.write(JSON.stringify(entry) + '\n');
}
