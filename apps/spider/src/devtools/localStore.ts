import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'

import { ObjectNotFoundError, type ObjectStore } from '../storage/store'

const codeOf = (error: unknown) => (error as { code?: string } | null)?.code

// What the recorder and the runner write to, as plain files under one folder instead of the bucket. It also keeps each
// account's device identity, so a local browser profile always goes with the same device.
export class LocalStore implements Pick<ObjectStore, 'put' | 'upload' | 'get' | 'create'> {
   private readonly root: string

   public constructor(root: string) {
      this.root = resolve(root)
   }

   private pathFor(key: string) {
      const path = resolve(this.root, key)

      if (!path.startsWith(`${this.root}${sep}`)) {
         throw new Error('That key is outside the devtools folder.')
      }

      return path
   }

   public async put(key: string, body: string) {
      const path = this.pathFor(key)

      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, body)
   }

   public async upload(key: string, localPath: string) {
      const path = this.pathFor(key)

      await mkdir(dirname(path), { recursive: true })
      await copyFile(localPath, path)
   }

   public async get(key: string) {
      try {
         return await readFile(this.pathFor(key), 'utf8')
      } catch (error) {
         throw codeOf(error) === 'ENOENT' ? new ObjectNotFoundError(key) : error
      }
   }

   public async create(key: string, body: string) {
      const path = this.pathFor(key)

      await mkdir(dirname(path), { recursive: true })

      try {
         await writeFile(path, body, { flag: 'wx' })

         return '1'
      } catch (error) {
         if (codeOf(error) === 'EEXIST') {
            return undefined
         }

         throw error
      }
   }
}
