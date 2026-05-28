import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const requiredFiles = [
  'dist/esm/index.js',
  'dist/esm/index.d.ts',
  'dist/cjs/index.js',
  'dist/cjs/package.json',
  'README.md',
  'LICENSE',
  'package.json'
];

const forbiddenPrefixes = [
  'src/',
  'test/',
  'examples/',
  'node_modules/'
];

const forbiddenFiles = [
  '.env',
  '.env.example'
];

const tempDir = await mkdtemp(join(tmpdir(), 'pdfbolt-node-pack-'));
const packDir = join(tempDir, 'pack');
const installDir = join(tempDir, 'consumer');
const npmEnv = {
  ...process.env,
  npm_config_dry_run: 'false'
};

await mkdir(packDir, { recursive: true });
await mkdir(installDir, { recursive: true });

const packOutput = execFileSync('npm', ['pack', '--json', '--pack-destination', packDir], {
  encoding: 'utf8',
  env: npmEnv
});
const [packInfo] = JSON.parse(packOutput);

if (!packInfo?.filename || !Array.isArray(packInfo.files)) {
  throw new Error('npm pack --json returned an unexpected response.');
}

const packageFiles = packInfo.files.map((file) => normalizePackagePath(file.path));

for (const requiredFile of requiredFiles) {
  if (!packageFiles.includes(requiredFile)) {
    throw new Error(`Packed package is missing ${requiredFile}.`);
  }
}

for (const packageFile of packageFiles) {
  if (forbiddenFiles.includes(packageFile) || forbiddenPrefixes.some((prefix) => packageFile.startsWith(prefix))) {
    throw new Error(`Packed package should not include ${packageFile}.`);
  }
}

const tarballPath = join(packDir, packInfo.filename);

try {
  execFileSync('npm', ['init', '-y'], { cwd: installDir, stdio: 'ignore', env: npmEnv });
  execFileSync('npm', ['install', tarballPath], { cwd: installDir, stdio: 'ignore', env: npmEnv });

  execFileSync(
    'node',
    [
      '--input-type=module',
      '-e',
      "const sdk = await import('@pdfbolt/node'); if (typeof sdk.PDFBolt !== 'function' || typeof sdk.VERSION !== 'string') process.exit(1);"
    ],
    { cwd: installDir, stdio: 'inherit' }
  );

  execFileSync(
    'node',
    [
      '-e',
      "const sdk = require('@pdfbolt/node'); if (typeof sdk.PDFBolt !== 'function' || typeof sdk.VERSION !== 'string') process.exit(1);"
    ],
    { cwd: installDir, stdio: 'inherit' }
  );
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log(`Packed package ${packInfo.filename} passed ESM and CommonJS smoke tests.`);

function normalizePackagePath(path) {
  return path.startsWith('package/') ? path.slice('package/'.length) : path;
}
