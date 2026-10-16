import { cp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const workerRoot = path.join(root, '.cloudflare', 'output', 'v0', 'workers', 'default');
const bundleRoot = path.join(workerRoot, 'bundle');
const ssrSourceRoot = path.join(root, 'dist', 'server', 'ssr');
const ssrBundleRoot = path.join(bundleRoot, 'ssr');
const workerEntryPath = path.join(bundleRoot, 'index.js');
const workerConfigPath = path.join(workerRoot, 'worker.config.json');

const moduleTypeFor = (filePath) => {
  switch (path.extname(filePath).toLowerCase()) {
    case '.js':
    case '.mjs':
      return 'esm';
    case '.wasm':
      return 'wasm';
    case '.json':
      return 'json';
    case '.bin':
      return 'data';
    case '.txt':
    case '.html':
    case '.sql':
      return 'text';
    case '.map':
      return 'sourcemap';
    default:
      return 'data';
  }
};

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(filePath)));
    else files.push(filePath);
  }
  return files;
}

function resolveRelativeImport(importerPath, specifier) {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
  const candidate = path.resolve(path.dirname(importerPath), cleanSpecifier);
  return [candidate, `${candidate}.js`, `${candidate}.mjs`, `${candidate}.json`, path.join(candidate, 'index.js')];
}

async function validateRelativeImports(files) {
  const missing = [];
  const importPatterns = [
    /\bimport\s*(?:\(\s*)?["'`]([^"'`]+)["'`]/g,
    /\bfrom\s*["'`]([^"'`]+)["'`]/g,
  ];

  for (const filePath of files.filter((item) => /\.(?:js|mjs)$/.test(item))) {
    const source = await readFile(filePath, 'utf8');
    for (const pattern of importPatterns) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        if (!specifier.startsWith('.')) continue;
        const candidates = resolveRelativeImport(filePath, specifier);
        const candidateExists = await Promise.all(candidates.map((candidate) => exists(candidate)));
        if (!candidateExists.some(Boolean)) {
          missing.push(`${path.relative(bundleRoot, filePath)} -> ${specifier}`);
        }
      }
    }
  }

  if (missing.length > 0) throw new Error(`Cloudflare Worker output has missing relative imports:\n${missing.join('\n')}`);
}

async function main() {
  for (const requiredPath of [bundleRoot, workerEntryPath, workerConfigPath, path.join(ssrSourceRoot, 'index.js')]) {
    if (!(await exists(requiredPath))) throw new Error(`Expected Cloudflare build output is missing: ${path.relative(root, requiredPath)}`);
  }

  await cp(ssrSourceRoot, ssrBundleRoot, { recursive: true });

  const workerEntry = await readFile(workerEntryPath, 'utf8');
  const legacySsrImport = '../../../../../../dist/server/ssr/index.js';
  if (workerEntry.includes(legacySsrImport)) {
    await writeFile(workerEntryPath, workerEntry.replaceAll(legacySsrImport, './ssr/index.js'));
  } else if (!workerEntry.includes('./ssr/index.js')) {
    throw new Error(`Expected vinext SSR import was not found in ${path.relative(root, workerEntryPath)}`);
  }

  const ssrEntryPath = path.join(ssrBundleRoot, 'index.js');
  const ssrEntry = await readFile(ssrEntryPath, 'utf8');
  const legacyWorkerImport = '../../../.cloudflare/output/v0/workers/default/bundle/index.js';
  if (ssrEntry.includes(legacyWorkerImport)) {
    await writeFile(ssrEntryPath, ssrEntry.replaceAll(legacyWorkerImport, '../index.js'));
  }

  const workerConfig = JSON.parse(await readFile(workerConfigPath, 'utf8'));
  if (!workerConfig.manifest || typeof workerConfig.manifest.modules !== 'object') throw new Error('Cloudflare Worker manifest is missing from worker.config.json');

  const files = await walk(bundleRoot);
  for (const filePath of files) {
    const relativePath = path.relative(bundleRoot, filePath).split(path.sep).join('/');
    if (relativePath === '.vite/manifest.json') continue;
    workerConfig.manifest.modules[relativePath] = { type: moduleTypeFor(filePath) };
  }
  await writeFile(workerConfigPath, `${JSON.stringify(workerConfig)}\n`);

  await validateRelativeImports(files);
  console.log(`Prepared Cloudflare Worker output with ${files.length} files and ${Object.keys(workerConfig.manifest.modules).length} manifest modules.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Failed to prepare Cloudflare Worker output');
  process.exitCode = 1;
});
