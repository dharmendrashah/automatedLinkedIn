import { readJsonSync, readdirSync } from 'fs-extra'
import { addAliases } from 'module-alias'
import path from 'path'

type PackageJson = {
   dependencies?: Record<string, string>
}

export class Aliases {
   public static async config() {
      this.configInternalPackages()

      this.configDirectories()
   }

   public static configInternalPackages() {
      const { dependencies = {} } = readJsonSync('package.json') as PackageJson

      const aliases = Object.keys(dependencies)
         .filter(name => name.startsWith('@automatedLinkedIn/'))
         .map(name => ({ [name]: `${name}/dist/index.js` }))

      const flatAliases = Object.assign({}, ...aliases)

      addAliases(flatAliases)
   }

   public static configDirectories() {
      const directories = readdirSync(__dirname, { withFileTypes: true })
         .filter(directory => directory.isDirectory())
         .map(({ name }) => name)

      const aliases = directories.map(directory => ({ [directory]: path.resolve(__dirname, directory) }))

      const flatAliases = Object.assign({}, ...aliases)

      addAliases(flatAliases)
   }
}

Aliases.config()
