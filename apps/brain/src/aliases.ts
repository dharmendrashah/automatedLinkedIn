import { readJsonSync, readdirSync } from 'fs-extra'
import { addAliases } from 'module-alias'
import path from 'path'

type TsConfig = {
   extends: string
   compilerOptions: Record<string, string>
   references: { path: string }[]
}

export class Aliases {
   public static async config() {
      this.configInternalPackages()

      this.configDirectories()
   }

   public static configInternalPackages() {
      const tsConfig = readJsonSync('tsconfig.json') as TsConfig

      const aliases = tsConfig.references.map(({ path: referencePath }) => {
         const { name } = readJsonSync(path.join(referencePath, 'package.json')) as { name: string }

         return { [name]: `${name}/dist/index.js` }
      })

      const flatAliases = Object.assign({}, ...aliases)

      addAliases(flatAliases)
   }

   public static configDirectories() {
      const directories = readdirSync('./src', { withFileTypes: true })
         .filter(directory => directory.isDirectory())
         .map(({ name }) => name)

      const aliases = directories.map(directory => ({ [directory]: path.resolve(__dirname, directory) }))

      const flatAliases = Object.assign({}, ...aliases)

      addAliases(flatAliases)
   }
}

Aliases.config()
