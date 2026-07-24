// repair-fatal-incident-test-index-signature.mjs
import {
  readFile,
  writeFile,
} from 'node:fs/promises'

const file =
  'apps/desktop/src/fatal/fatal-incident.test.ts'

let source = await readFile(file, 'utf8')

source = source
  .replaceAll(
    'incident.context.accessToken',
    "incident.context['accessToken']",
  )
  .replaceAll(
    'incident.context.password',
    "incident.context['password']",
  )
  .replaceAll(
    'incident.context.authorization',
    "incident.context['authorization']",
  )
  .replaceAll(
    'incident.context.operation',
    "incident.context['operation']",
  )

await writeFile(file, source, 'utf8')

console.log(
  'Repaired fatal-incident.test.ts index-signature access.',
)