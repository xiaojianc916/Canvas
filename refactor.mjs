// repair-main-fatal-import.mjs
import {
  readFile,
  writeFile,
} from 'node:fs/promises'

const file =
  'apps/desktop/src/main.tsx'

const source = await readFile(file, 'utf8')

const next = source.replace(
  "from './fatal/fatal-controller'",
  "from './fatal/fatal-runtime'",
)

if (next === source) {
  if (
    source.includes(
      "from './fatal/fatal-runtime'",
    )
  ) {
    console.log(
      'main.tsx is already correct.',
    )
    process.exit(0)
  }

  throw new Error(
    'Could not find the obsolete fatal-controller import.',
  )
}

await writeFile(file, next, 'utf8')

console.log(
  'Fixed main.tsx fatal controller import.',
)