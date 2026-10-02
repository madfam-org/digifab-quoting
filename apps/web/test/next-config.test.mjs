// Guards the Next.js image-optimizer posture (GHSA-2xp9-vwfh-vxw4 defence in
// depth) for apps/web.
//
// Nothing in apps/web imports next/image, so the optimizer is off and
// /_next/image answers 404. remotePatterns stays an exact, empty allow-list so
// that re-enabling optimization later cannot silently turn the web pod into an
// open image proxy. Widening it is a security decision: change it here, in
// next.config.js and in AGENTS.md together.
//
// Node's built-in test runner, no extra dependency:
//   pnpm --filter @cotiza/web test:config   (CI: Unit Tests)
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextConfig = require(join(webRoot, 'next.config.js'));

test('the image optimizer is disabled', () => {
  assert.equal(nextConfig.images?.unoptimized, true);
});

test('remotePatterns is an exact, empty allow-list with no legacy domains', () => {
  assert.deepEqual(nextConfig.images?.remotePatterns, []);
  assert.equal(nextConfig.images?.domains, undefined);
});

test('no source file imports next/image', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(path);
      } else if (
        /\.(t|j)sx?$/.test(entry.name) &&
        /from\s+['"]next\/(legacy\/)?image['"]/.test(readFileSync(path, 'utf8'))
      ) {
        offenders.push(relative(webRoot, path));
      }
    }
  };
  walk(join(webRoot, 'src'));
  assert.deepEqual(
    offenders,
    [],
    'next/image was imported; revisit images.unoptimized before shipping',
  );
});
