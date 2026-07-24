import { readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const PhpParser = require('php-parser')
const parser = new PhpParser.Engine({ parser: { version: '8.1' } })

function phpFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return phpFiles(path)
    return extname(entry.name).toLowerCase() === '.php' ? [path] : []
  })
}

const files = phpFiles(join(process.cwd(), 'api'))
for (const file of files) {
  parser.parseCode(readFileSync(file, 'utf8'), file)
}

console.log(`Parsed ${files.length} PHP files successfully.`)
