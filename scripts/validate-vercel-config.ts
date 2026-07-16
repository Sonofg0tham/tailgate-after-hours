import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const cliPath = resolve('node_modules', '@vercel', 'config', 'dist', 'cli.js');
const result = spawnSync(process.execPath, [cliPath, 'compile'], {
  cwd: process.cwd(),
  encoding: 'utf8',
});

if (result.status !== 0) {
  throw new Error(result.stderr || 'Vercel config compilation failed.');
}

const compiled = JSON.parse(result.stdout) as {
  headers?: Array<{ headers?: Array<{ key?: string; value?: string }> }>;
};
const headerKeys = new Set(compiled.headers?.flatMap((route) => route.headers?.map((header) => header.key) ?? []) ?? []);
const requiredHeaderKeys = [
  'Content-Security-Policy',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'X-Frame-Options',
  'Permissions-Policy',
];
const missingHeaderKeys = requiredHeaderKeys.filter((key) => !headerKeys.has(key));

if (compiled.headers?.length !== 1 || missingHeaderKeys.length > 0) {
  throw new Error(`Compiled Vercel config is missing security headers: ${missingHeaderKeys.join(', ') || 'route'}.`);
}

const contentSecurityPolicy = compiled.headers[0]?.headers?.find(
  (header) => header.key === 'Content-Security-Policy',
)?.value;

if (!contentSecurityPolicy?.includes("connect-src 'self' blob:")) {
  throw new Error('Compiled Content Security Policy must permit same-origin and local GLTF blob requests.');
}

console.log(`Vercel config contains ${headerKeys.size} required security headers.`);
