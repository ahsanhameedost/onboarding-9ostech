import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const source = join(root, 'api')
const destination = join(root, 'dist', 'api')
const runtimeFiles = ['.htaccess', 'auth.php', 'bootstrap.php', 'index.php', 'mailgun.php']

if (!existsSync(join(root, 'dist', 'index.html'))) {
  throw new Error('Vite build output is missing. Run this script after vite build.')
}

rmSync(destination, { recursive: true, force: true })
mkdirSync(destination, { recursive: true })
for (const file of runtimeFiles) {
  copyFileSync(join(source, file), join(destination, file))
}
copyFileSync(join(root, 'src', 'assets', 'oakboard-logo.svg'), join(root, 'dist', 'oakboard-logo.svg'))

console.log(`Prepared dist/ with ${runtimeFiles.length} OakBoard PHP API runtime files.`)
