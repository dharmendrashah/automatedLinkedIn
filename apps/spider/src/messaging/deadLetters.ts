import { type Channel } from 'amqplib'

import { TASK_DEAD_QUEUE, type TaskCommand, taskCommandSchema } from '@automatedLinkedIn/contracts'

type DeadChannel = Pick<Channel, 'prefetch' | 'consume' | 'cancel' | 'ack' | 'nack'>

// A task the broker gave up on after its worker died (killed for memory, say) never reaches `onExhausted`, so brain would
// show its session as in progress for ever. Each one is answered here, then removed from the dead-letter queue.
export const answerDeadTasks = async (
   channel: DeadChannel,
   answer: (command: TaskCommand) => Promise<void>,
   log: Pick<Console, 'info' | 'error'> = console
) => {
   await channel.prefetch(1)

   const { consumerTag } = await channel.consume(
      TASK_DEAD_QUEUE,
      async message => {
         if (!message) {
            return
         }

         let command: TaskCommand

         try {
            command = taskCommandSchema.parse(JSON.parse(message.content.toString()))
         } catch {
            // Never logged with its content: it may carry secrets. It can never become valid, so it is not kept.
            log.error('Dropped a dead-lettered message that is not a valid task')
            channel.ack(message)

            return
         }

         try {
            await answer(command)
            log.info(`spider job answered after it was given up: Task ${command.task} ${command.task_id}`)
            channel.ack(message)
         } catch {
            channel.nack(message, false, true)
         }
      },
      { noAck: false }
   )

   return { stop: () => channel.cancel(consumerTag) }
}
