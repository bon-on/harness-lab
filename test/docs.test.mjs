import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const readmes = { en: ['README.md', 'docs/images/harness-structure.svg'], ko: ['README.ko.md', 'docs/images/harness-structure.ko.svg'] };
const headingLevels = text => text.split('\n').filter(line => /^#+ /.test(line)).map(line => line.match(/^#+/)[0].length);
const diagramNames = svg => [...svg.matchAll(/<tspan class="(?:name|claude|harness)">([^<]+)<\/tspan>/g)].map(match => match[1]);

test('English and Korean READMEs mirror each other and link their diagrams', () => {
  const en = readFileSync(readmes.en[0], 'utf8');
  const ko = readFileSync(readmes.ko[0], 'utf8');
  assert.match(en, /\]\(README\.ko\.md\)/);
  assert.match(ko, /\]\(README\.md\)/);
  assert.deepEqual(headingLevels(ko), headingLevels(en), 'README.ko.md must keep the same heading structure as README.md');
  for (const [readme, image] of Object.values(readmes)) {
    assert.ok(readFileSync(readme, 'utf8').includes(`](${image})`), `${readme} must show ${image}`);
  }
});

test('structure diagrams list what init creates', t => {
  const root = mkdtempSync(join(tmpdir(), 'harness-docs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(spawnSync(process.execPath, [resolve('dist/index.js'), 'init', root]).status, 0);
  const label = (...parts) => statSync(join(root, ...parts)).isDirectory() ? `${parts.at(-1)}/` : parts.at(-1);
  // The diagram collapses .claude/agents/ into one row.
  const names = readdirSync(root).filter(entry => entry !== '.claude').map(entry => label(entry));
  names.push(...readdirSync(join(root, 'harness')).map(entry => label('harness', entry)));
  for (const agent of readdirSync(join(root, '.claude/agents'))) names.push(label('.claude', 'agents', agent));
  if (readdirSync(join(root, '.claude')).includes('agents')) names.push('.claude/agents/');
  for (const [, image] of Object.values(readmes)) {
    const svg = readFileSync(image, 'utf8');
    const shown = diagramNames(svg).filter(name => name !== 'your-project/');
    assert.deepEqual([...shown].sort(), [...names].sort(), `${image} must list exactly the files init creates`);
    assert.match(svg, /code-reviewer ·/, `${image} must show the review step`);
  }
});
