import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { chooseBlocking, clearWebsiteFilter, filterPatterns, installWebsiteFilter } from './websiteFilter'

describe('filterPatterns', () => {
   it('should match a domain and its subdomains, and an address or a single name only as it is', () => {
      expect(filterPatterns(['linkedin.com', 'localhost', '127.0.0.1', '[::1]'])).toEqual([
         '*://*.linkedin.com/*',
         '*://localhost/*',
         '*://127.0.0.1/*',
         '*://[::1]/*',
      ])
   })

   it('should leave out a host that is listed twice', () => {
      expect(filterPatterns(['linkedin.com', 'linkedin.com'])).toEqual(['*://*.linkedin.com/*'])
   })
})

describe('installWebsiteFilter', () => {
   let root: string

   const writePolicies = async (policies: object, folder = root) => {
      await mkdir(join(folder, 'distribution'), { recursive: true })
      await writeFile(join(folder, 'distribution', 'policies.json'), JSON.stringify({ policies }))
   }
   const readPolicies = async (folder = root) =>
      JSON.parse(await readFile(join(folder, 'distribution', 'policies.json'), 'utf8')).policies

   beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'website-filter-'))
   })

   afterEach(async () => {
      await rm(root, {
         recursive: true,
         force: true,
      })
   })

   it('should block every address except the allowed and the embedded hosts, and keep the other policies', async () => {
      await writePolicies({
         DisableAppUpdate: true,
         WebsiteFilter: {
            Block: ['https://localhost/*'],
            Exceptions: ['https://localhost/*'],
         },
      })

      await installWebsiteFilter(join(root, 'camoufox-bin'), ['linkedin.com'], ['google.com'])

      expect(await readPolicies()).toEqual({
         DisableAppUpdate: true,
         WebsiteFilter: {
            Block: ['<all_urls>'],
            Exceptions: ['*://*.linkedin.com/*', '*://*.google.com/*'],
         },
      })
   })

   it('should find the policies of a macOS bundle next to its MacOS folder', async () => {
      const resources = join(root, 'Camoufox.app', 'Contents', 'Resources')

      await writePolicies({ DisableAppUpdate: true }, resources)
      await installWebsiteFilter(join(root, 'Camoufox.app', 'Contents', 'MacOS', 'camoufox'), ['linkedin.com'], [])

      expect((await readPolicies(resources)).WebsiteFilter.Exceptions).toEqual(['*://*.linkedin.com/*'])
   })

   it('should refuse, so the allowlist is never dropped, when the browser has no policies file', async () => {
      await expect(installWebsiteFilter(join(root, 'camoufox-bin'), ['linkedin.com'], [])).rejects.toThrow(/policies/)
   })

   it('should refuse a list with no allowed host, which would block everything', async () => {
      await writePolicies({})

      await expect(installWebsiteFilter(join(root, 'camoufox-bin'), [], ['google.com'])).rejects.toThrow(/allowed host/)
   })

   it('should leave the file alone when the filter is already what it should be', async () => {
      await writePolicies({})
      await installWebsiteFilter(join(root, 'camoufox-bin'), ['linkedin.com'], [])

      const first = await readFile(join(root, 'distribution', 'policies.json'), 'utf8')

      await installWebsiteFilter(join(root, 'camoufox-bin'), ['linkedin.com'], [])

      expect(await readFile(join(root, 'distribution', 'policies.json'), 'utf8')).toBe(first)
   })

   it('should take its own filter out again, for the local tool, which allows every address', async () => {
      await writePolicies({ DisableAppUpdate: true })
      await installWebsiteFilter(join(root, 'camoufox-bin'), ['linkedin.com'], [])
      await clearWebsiteFilter(join(root, 'camoufox-bin'))

      expect(await readPolicies()).toEqual({ DisableAppUpdate: true })
   })

   describe('chooseBlocking', () => {
      it('should leave the blocking to the browser once its filter is in place', async () => {
         await writePolicies({})

         await expect(
            chooseBlocking({
               executablePath: async () => join(root, 'camoufox-bin'),
               hosts: ['linkedin.com'],
               embedHosts: [],
               warn: vi.fn(),
            })
         ).resolves.toBe('browser')
         expect((await readPolicies()).WebsiteFilter.Block).toEqual(['<all_urls>'])
      })

      it('should keep checking every request, and say why, when the filter cannot be put in place', async () => {
         const warn = vi.fn()

         await expect(
            chooseBlocking({
               executablePath: async () => join(root, 'camoufox-bin'),
               hosts: ['linkedin.com'],
               embedHosts: [],
               warn,
            })
         ).resolves.toBe('route')
         expect(warn).toHaveBeenCalledWith(expect.stringContaining('policies'))
      })

      it('should keep checking every request when the browser cannot be found', async () => {
         const warn = vi.fn()

         await expect(
            chooseBlocking({
               executablePath: async () => {
                  throw new Error('Camoufox is not installed')
               },
               hosts: ['linkedin.com'],
               embedHosts: [],
               warn,
            })
         ).resolves.toBe('route')
         expect(warn).toHaveBeenCalled()
      })
   })
})
