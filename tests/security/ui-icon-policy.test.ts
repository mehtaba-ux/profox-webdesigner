import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const UI_ROOTS = ['src', 'assets', 'public'];
const UI_FILES = ['index.html'];
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.html', '.svg', '.css']);

const FORBIDDEN_PATTERNS = [
  { label: 'prohibited sparkle icon identifier', pattern: /\b(?:Sparkle|Sparkles|WandSparkles)\b/i },
  { label: 'prohibited sparkle glyph', pattern: /✨/u },
];

function collectTextFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return TEXT_EXTENSIONS.has(extname(path).toLowerCase()) ? [path] : [];

  return readdirSync(path).flatMap(entry => collectTextFiles(join(path, entry)));
}

test('frontend never uses the prohibited sparkle/glint icon family', () => {
  const files = [
    ...UI_ROOTS.flatMap(root => collectTextFiles(root)),
    ...UI_FILES.filter(file => existsSync(file)),
  ];

  const violations: string[] = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const searchable = `${file}\n${content}`;

    for (const rule of FORBIDDEN_PATTERNS) {
      if (rule.pattern.test(searchable)) violations.push(`${file}: ${rule.label}`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `The sparkle/glint icon family is prohibited system-wide. Use a semantic alternative from docs/UI_ICON_POLICY.md instead.\n${violations.join('\n')}`,
  );
});
