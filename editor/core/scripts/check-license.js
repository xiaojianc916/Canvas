// TLDRaw License Key Validation
// Runs during canvas package build - fails if TLDRaw_LICENSE_KEY not set

import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local if exists
try {
  const envPath = resolve(process.cwd(), '.env.local')
  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length > 0) {
      process.env[key.trim()] = rest.join('=').trim()
    }
  }
} catch {
  // .env.local not found, use existing env
}

const licenseKey = process.env.TLDRaw_LICENSE_KEY

if (!licenseKey || licenseKey.trim() === '') {
  console.error('❌ TLDRaw_LICENSE_KEY environment variable is required for production builds.')
  console.error('   Set it in your CI/CD pipeline or local .env.local')
  console.error('   See docs/adr/ADR-001-tldraw-license.md for details.')
  process.exit(1)
}

if (licenseKey.startsWith('DEV-') || licenseKey.startsWith('TEST-')) {
  console.warn('⚠️  Using development/test license key. Not valid for production.')
}

console.log('✅ TLDRaw license key validated')
