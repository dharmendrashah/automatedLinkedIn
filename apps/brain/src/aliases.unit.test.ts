import fs from 'fs-extra'
import { addAliases } from 'module-alias'
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Aliases } from './aliases'

vi.mock('module-alias', () => ({ addAliases: vi.fn() }))

describe('Aliases', () => {
   let mockReadJsonSync: MockInstance
   let mockReaddirSync: MockInstance
   const mockAddAliases = vi.mocked(addAliases)

   beforeEach(() => {
      vi.clearAllMocks()

      mockReadJsonSync = vi.spyOn(fs, 'readJsonSync')
      mockReaddirSync = vi.spyOn(fs, 'readdirSync')
   })

   afterEach(() => {
      vi.restoreAllMocks()
   })

   describe('.config', () => {
      it('should configure internal packages and directories', () => {
         const configInternalPackagesSpy = vi.spyOn(Aliases, 'configInternalPackages')

         const configDirectoriesSpy = vi.spyOn(Aliases, 'configDirectories')

         Aliases.config()

         expect(configInternalPackagesSpy).toHaveBeenCalled()

         expect(configDirectoriesSpy).toHaveBeenCalled()
      })
   })

   describe('.configInternalPackages', () => {
      it('should read package.json file', () => {
         Aliases.configInternalPackages()

         expect(mockReadJsonSync).toBeCalledWith('package.json')
      })

      it('should add aliases only for internal packages', () => {
         const packageName = '@automatedLinkedIn/config'

         const dependencies = {
            [packageName]: 'workspace:*',
            express: '^5.3.0',
         }

         mockReadJsonSync.mockReturnValueOnce({ dependencies })

         Aliases.configInternalPackages()

         expect(mockAddAliases).toBeCalledWith({ [packageName]: `${packageName}/dist/index.js` })
      })
   })

   describe('.configDirectories', () => {
      it('should read and add aliases for directories', () => {
         const directories = ['core', 'env', 'middlewares', 'modules', 'testing', 'types'].map(name => ({
            name,
            isDirectory: () => true,
         }))

         mockReaddirSync.mockReturnValueOnce(directories)

         Aliases.configDirectories()

         expect(mockReaddirSync).toHaveBeenCalledOnce()

         expect(mockAddAliases).toBeCalled()
      })
   })
})
