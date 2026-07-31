import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const source = join(root, 'api')
const destination = join(root, 'dist', 'api')
const runtimeFiles = ['.htaccess', 'admin.php', 'auth.php', 'bootstrap.php', 'index.php', 'mailgun.php']

if (!existsSync(join(root, 'dist', 'index.html'))) {
  throw new Error('Vite build output is missing. Run this script after vite build.')
}

rmSync(destination, { recursive: true, force: true })
mkdirSync(destination, { recursive: true })
for (const file of runtimeFiles) {
  copyFileSync(join(source, file), join(destination, file))
}
copyFileSync(join(root, 'src', 'assets', 'oakboard-logo.svg'), join(root, 'dist', 'oakboard-logo.svg'))

/**
 * Remove fingerprinted assets that no longer belong to any release.
 *
 * The build runs with `emptyOutDir: false` so the live release keeps serving
 * while Vite writes the next one. The cost is that nothing ever deletes the
 * previous release, and those files stay reachable at their old URLs. A browser
 * or proxy still holding the previous index.html therefore keeps loading the
 * previous stylesheet and bundle, so a fix that shipped weeks ago can still be
 * invisible in production. Pruning here — after the new index has been written,
 * never before — closes that window without giving up the atomic swap.
 *
 * The manifest is the authority on what the new release needs. Walking
 * index.html alone would not do: lazily imported route chunks are pulled in by
 * the entry bundle at runtime and are named nowhere in the HTML, so anything
 * driven by the HTML would delete every code-split page in the app.
 */
function pruneStaleAssets() {
  const assetsDirectory = join(root, 'dist', 'assets')
  const manifestPath = join(root, 'dist', '.vite', 'manifest.json')
  if (!existsSync(assetsDirectory) || !existsSync(manifestPath)) {
    console.warn('Skipped asset pruning: no build manifest was found.')
    return 0
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const live = new Set()
  for (const entry of Object.values(manifest)) {
    for (const value of [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])]) {
      if (typeof value === 'string' && value.startsWith('assets/')) {
        live.add(value.slice('assets/'.length))
      }
    }
  }

  // The generated index also names assets directly — the favicon among them.
  // Anything it points at is by definition part of this release, whether or not
  // the manifest happens to attribute it to a chunk.
  const html = readFileSync(join(root, 'dist', 'index.html'), 'utf8')
  for (const match of html.matchAll(/\/assets\/([\w.-]+)/g)) {
    live.add(match[1])
  }

  if (live.size === 0) {
    console.warn('Skipped asset pruning: the build manifest listed no assets.')
    return 0
  }

  let removed = 0
  for (const file of readdirSync(assetsDirectory)) {
    if (live.has(file)) continue
    rmSync(join(assetsDirectory, file), { force: true })
    removed += 1
  }

  // The manifest is a build artefact, not part of the release. Leaving it in
  // dist/ would publish the application's whole module graph on the live host.
  rmSync(join(root, 'dist', '.vite'), { recursive: true, force: true })
  return removed
}

const removed = pruneStaleAssets()

console.log(`Prepared dist/ with ${runtimeFiles.length} OakBoard PHP API runtime files.`)
console.log(`Removed ${removed} stale asset(s) left over from previous builds.`)
