// Undo and redo over whole canvas snapshots. A new change clears what could be redone.
export type History<T> = { past: T[]; present: T; future: T[] }

const LIMIT = 50

export const startHistory = <T>(present: T): History<T> => ({
   past: [],
   present,
   future: [],
})

export const record = <T>({ past, present }: History<T>, next: T): History<T> => ({
   past: [...past, present].slice(-LIMIT),
   present: next,
   future: [],
})

export const undo = <T>(history: History<T>): History<T> => {
   const previous = history.past.at(-1)

   return previous === undefined
      ? history
      : {
           past: history.past.slice(0, -1),
           present: previous,
           future: [history.present, ...history.future],
        }
}

export const redo = <T>(history: History<T>): History<T> => {
   const [next, ...rest] = history.future

   return next === undefined
      ? history
      : {
           past: [...history.past, history.present],
           present: next,
           future: rest,
        }
}
