import { execFile } from 'node:child_process'

export type CommandResult = { code: number; stdout: string; stderr: string }

// The one place a program (gcloud, git) is started, so the tests can answer for it.
export type RunCommand = (command: string, args: string[]) => Promise<CommandResult>

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024

export const runCommand: RunCommand = (command, args) =>
   new Promise(resolve => {
      execFile(command, args, { maxBuffer: MAX_OUTPUT_BYTES }, (error, stdout, stderr) => {
         if (!error) {
            resolve({
               code: 0,
               stdout,
               stderr,
            })

            return
         }

         resolve({
            code: typeof error.code === 'number' ? error.code : 1,
            stdout,
            stderr: error.code === 'ENOENT' ? `${command} is not installed` : stderr || error.message,
         })
      })
   })
