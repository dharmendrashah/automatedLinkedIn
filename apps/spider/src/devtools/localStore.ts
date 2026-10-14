import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'

import { type ObjectStore } from '../storage/store'

// What the recorder and the runner write to, as plain files under one folder instead of the bucket.
export class LocalStore implements Pick<ObjectStore, 'put' | 'upload'> {
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
}
