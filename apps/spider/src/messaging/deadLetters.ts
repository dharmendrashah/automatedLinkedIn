import { type Channel } from 'amqplib'

import { TASK_DEAD_QUEUE, type TaskCommand, taskCommandSchema } from '@automatedLinkedIn/contracts'

type DeadChannel = Pick<Channel, 'prefetch' | 'consume' | 'cancel' | 'ack' | 'nack'>

type DeadGetChannel = Pick<Channel, 'get' | 'ack' | 'nack'>

type Log = Pick<Console, 'info' | 'error'>

const DROPPED = 'Dropped a dead-lettered message that is not a valid task'

// Never logged with its content: it may carry secrets.
const parseDeadTask = (content: Buffer): TaskCommand | undefined => {
   try {
      return taskCommandSchema.parse(JSON.parse(content.toString()))
   } catch {
      return undefined
   }
}

const answered = (command: TaskCommand) =>
   `spider job answered after it was given up: Task ${command.task} ${command.task_id}`

// A task the broker gave up on after its worker died (killed for memory, say) never reaches `onExhausted`, so brain would
// show its session as in progress for ever. Each one is answered here, then removed from the dead-letter queue.
export const answerDeadTasks = async (
   channel: DeadChannel,
   answer: (command: TaskCommand) => Promise<void>,
   log: Log = console
) => {
   await channel.prefetch(1)

   const { consumerTag } = await channel.consume(
      TASK_DEAD_QUEUE,
      async message => {
         if (!message) {
            return
         }

         // It can never become valid, so it is not kept.
         const command = parseDeadTask(message.content)

         if (!command) {
            log.error(DROPPED)
            channel.ack(message)

            return
         }

         try {
            await answer(command)
            log.info(answered(command))
            channel.ack(message)
         } catch {
            channel.nack(message, false, true)
         }
      },
      { noAck: false }
   )

   return { stop: () => channel.cancel(consumerTag) }
}

// Once mode: answers every task waiting in the dead-letter queue, then returns. A task whose answer cannot be sent goes
// back to the queue and the drain stops, so the next run tries it.
export const drainDeadTasks = async (
   channel: DeadGetChannel,
   answer: (command: TaskCommand) => Promise<void>,
   log: Log = console
) => {
   for (;;) {
      const message = await channel.get(TASK_DEAD_QUEUE, { noAck: false })

      if (!message) {
         return
      }

      const command = parseDeadTask(message.content)

      if (!command) {
         log.error(DROPPED)
         channel.ack(message)

         continue
      }

      try {
         await answer(command)
      } catch {
         channel.nack(message, false, true)

         return
      }

      log.info(answered(command))
      channel.ack(message)
   }
}
