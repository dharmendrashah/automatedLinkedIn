import { readFile, writeFile } from 'node:fs/promises'
import { isIP } from 'node:net'
import { basename, dirname, join } from 'node:path'

// A Firefox match pattern for a host and its subdomains. An address or a single name (localhost) has no subdomains, and a
// pattern like `*.127.0.0.1` is not valid. Patterns ignore the port.
const patternOf = (host: string) => (host.includes('.') && !isIP(host) ? `*://*.${host}/*` : `*://${host}/*`)

export const filterPatterns = (hosts: string[]) => [...new Set(hosts.map(patternOf))]

// Camoufox's policies live in a `distribution` folder next to the browser; a macOS bundle keeps them under Resources.
const policiesPath = (executablePath: string) => {
   const folder = dirname(executablePath)

   return join(basename(folder) === 'MacOS' ? join(folder, '..', 'Resources') : folder, 'distribution', 'policies.json')
}

// Makes the browser itself refuse every address that is not allowed (.plan/browser-allowlist-policy.md), so no request has to be
// intercepted: Playwright turns the HTTP cache off while it intercepts. The filter covers the main frame, its redirects and
// its frames, not scripts or images, which is what the allowlist did before. `embedHosts` are the hosts of the frames LinkedIn
// needs (sign-in and captcha). Throws when it cannot be sure the filter is in place, so the caller keeps checking requests.
export const installWebsiteFilter = async (executablePath: string, hosts: string[], embedHosts: string[]) => {
   if (hosts.length === 0) {
      throw new Error('The website filter needs at least one allowed host')
   }

   const path = policiesPath(executablePath)
   let current: { policies?: Record<string, unknown> }

   try {
      current = JSON.parse(await readFile(path, 'utf8'))
   } catch {
      throw new Error('The browser has no policies file to put the website filter in')
   }

   const next = {
      ...current,
      policies: {
         ...current.policies,
         WebsiteFilter: {
            Block: ['<all_urls>'],
            Exceptions: filterPatterns([...hosts, ...embedHosts]),
         },
      },
   }
   const filter = next.policies.WebsiteFilter

   if (JSON.stringify(filter) !== JSON.stringify(current.policies?.WebsiteFilter)) {
      await writeFile(path, `${JSON.stringify(next, null, 2)}\n`)
   }

   const written = JSON.parse(await readFile(path, 'utf8'))

   if (JSON.stringify(written.policies?.WebsiteFilter) !== JSON.stringify(filter)) {
      throw new Error('The website filter could not be written')
   }
}

// Takes the filter out, for the local tool: it allows every address, and the file is shared by every browser of this install.
export const clearWebsiteFilter = async (executablePath: string) => {
   const path = policiesPath(executablePath)
   const current = JSON.parse(await readFile(path, 'utf8'))

   if (current.policies && 'WebsiteFilter' in current.policies) {
      delete current.policies.WebsiteFilter
      await writeFile(path, `${JSON.stringify(current, null, 2)}\n`)
   }
}

type ChooseBlocking = {
   executablePath: () => Promise<string>
   hosts: string[]
   embedHosts: string[]
   warn: (message: string) => void
}

// The browser blocks when its filter is in place; if anything is not sure, every request is checked as before, so the
// allowlist is never dropped.
export const chooseBlocking = async ({ executablePath, hosts, embedHosts, warn }: ChooseBlocking) => {
   try {
      await installWebsiteFilter(await executablePath(), hosts, embedHosts)

      return 'browser' as const
   } catch (error) {
      warn(
         `The allowlist is checked on every request, which keeps the browser cache off: ${error instanceof Error ? error.message : 'unknown error'}`
      )

      return 'route' as const
   }
}
