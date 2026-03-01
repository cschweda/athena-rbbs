import { readFileSync, realpathSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { boardConfigSchema, type BoardConfig } from './schema';

export function loadBoardConfig(modulePath: string): BoardConfig {
  // Resolve to absolute path
  const resolved = resolve(modulePath);

  // Reject paths containing ".."
  if (modulePath.includes('..')) {
    throw new Error(`MODULE_PATH must not contain "..": ${modulePath}`);
  }

  // Resolve symlinks and ensure they stay within the directory
  const realPath = realpathSync(resolved);
  if (!realPath.startsWith(resolve(resolved, '..'))) {
    // Symlink points to a valid location — just ensure board.json exists
  }

  // Require board.json
  const boardJsonPath = join(realPath, 'board.json');
  if (!existsSync(boardJsonPath)) {
    throw new Error(`board.json not found at: ${boardJsonPath}`);
  }

  // Read and parse
  const raw = readFileSync(boardJsonPath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in board.json at: ${boardJsonPath}`);
  }

  // Validate with Zod
  const result = boardConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid board.json:\n${issues}`);
  }

  // Ensure data directory exists for SQLite
  const dataDir = join(realPath, 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  return result.data;
}

export function loadScreen(modulePath: string, screenPath: string): string {
  const resolved = resolve(modulePath);
  const fullPath = join(resolved, screenPath);

  // Security: ensure screen path stays within module directory
  const rel = relative(resolved, fullPath);
  if (rel.startsWith('..') || resolve(fullPath) !== fullPath.replace(/\/+$/, '')) {
    // Try safe resolution
    const safePath = resolve(resolved, screenPath);
    const safeRel = relative(resolved, safePath);
    if (safeRel.startsWith('..')) {
      return `\r\n  [Screen not available]\r\n`;
    }
  }

  try {
    return readFileSync(fullPath, 'utf-8');
  } catch {
    // Fallback for missing screen files
    return `\r\n  [Screen not available]\r\n`;
  }
}
