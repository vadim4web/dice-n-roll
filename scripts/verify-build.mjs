import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('dist');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const resources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
assert(resources.some(path => path.endsWith('.js')), 'Missing production JavaScript');
assert(resources.some(path => path.endsWith('.css')), 'Missing production stylesheet');
for (const resource of resources) {
  if (/^(https?:|data:|#)/.test(resource)) continue;
  assert(resource.startsWith('./'), `Resource must use a relative URL for GitHub Pages: ${resource}`);
  assert(existsSync(resolve(root, resource)), `Missing resource: ${resource}`);
}
assert(!html.includes('/src/'), 'Development source leaked into production HTML');
assert(existsSync(resolve(root, '.nojekyll')), 'Missing .nojekyll');
assert(!existsSync(resolve(root, 'server.mjs')), 'Static deployment must not contain a Node.js server');
console.log('Static build verified: production assets exist, relative URLs support /dice-n-roll/, and .nojekyll is present.');
