import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertProductionBundleClean } from '../src/build/validateProductionBundle';

const assetsDirectory = resolve('dist', 'assets');
const javascriptFiles = readdirSync(assetsDirectory)
  .filter((fileName) => fileName.endsWith('.js'))
  .map((fileName) => {
    const path = resolve(assetsDirectory, fileName);
    return { path, source: readFileSync(path, 'utf8') };
  });

if (javascriptFiles.length === 0) {
  throw new Error(`Production bundle validation failed: no JavaScript assets found in ${assetsDirectory}.`);
}

assertProductionBundleClean(javascriptFiles);
console.log(`Production bundle contains no forbidden DEV hooks across ${javascriptFiles.length} JavaScript asset(s).`);
