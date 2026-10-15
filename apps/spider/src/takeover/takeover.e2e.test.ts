import { randomUUID } from 'node:crypto'
import { type Server, createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
   EXCHANGE,
   TAKEOVER_FRAME_KEY,
   TAKEOVER_INPUT_EXCHANGE,
   type TakeoverFrame,
   type TakeoverInput,
   takeoverFrameSchema,
} from '@automatedLinkedIn/contracts'

import { RABBITMQ_URL } from '../env'
import { Broker } from '../messaging/broker'
import { listenForInput, publishFrame } from '../messaging/takeover'
import { assertTopology } from '../messaging/topology'
import { CamoufoxDriver } from '../scraping/camoufoxDriver'
import { waitForOwner } from './waitForOwner'

// Needs RabbitMQ at RABBITMQ_URL and the Camoufox browser. The owner's side (brain and the web app) is played by this
// file: it reads the pictures from a queue of its own and publishes the inputs to the exchange, as brain does.

// What the page shows after a click or a key is written into its text, so the test can read it back.
const PAGE = `<!doctype html><html><body style="margin:0">
<button id="ok" style="position:absolute;left:100px;top:100px;width:200px;height:80px"
  onclick="log.textContent += ' clicked;'">OK</button>
<input id="code" style="position:absolute;left:100px;top:300px;width:200px;height:40px"
  oninput="log.textContent += ' typed:' + this.value + ';'">
<div id="log" style="position:absolute;left:100px;top:400px"></div>
</body></html>`

let server: Server
let baseUrl: string
const broker = new Broker(RABBITMQ_URL)

beforeAll(async () => {
   server = createServer((_request, response) => {
      response.setHeader('content-type', 'text/html')
      response.end(PAGE)
   })
   await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
   baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
})

afterAll(async () => {
   server.close()
   await broker.close()
})

describe('human takeover through RabbitMQ and a real browser', () => {
   it('should show the page, do the clicks and typing the owner sends, and end when they say they are done', async () => {
      const taskId = randomUUID()
      const takeoverChannel = await broker.consumeChannel()
      const ownerChannel = await broker.consumeChannel()

      await assertTopology(takeoverChannel)

      // The owner's side: a queue of its own on the pictures, so no other consumer takes them.
      const { queue } = await ownerChannel.assertQueue('', {
         exclusive: true,
         autoDelete: true,
      })

      await ownerChannel.bindQueue(queue, EXCHANGE, TAKEOVER_FRAME_KEY)

      const frames: TakeoverFrame[] = []

      await ownerChannel.consume(
         queue,
         message => {
            const frame = takeoverFrameSchema.parse(JSON.parse(String(message?.content)))

            if (frame.task_id === taskId) {
               frames.push(frame)
            }
         },
         { noAck: true }
      )

      const sendInput = (input: TakeoverInput) =>
         ownerChannel.publish(TAKEOVER_INPUT_EXCHANGE, taskId, Buffer.from(JSON.stringify(input)))

      const session = await new CamoufoxDriver({
         actionTimeoutMs: 30_000,
         isAllowedNavigation: () => true,
      }).open()

      try {
         await session.goto(baseUrl)

         if (!session.control) {
            throw new Error('The browser has no control')
         }

         const waiting = waitForOwner(
            taskId,
            session.control,
            {
               publishFrame: async frame => publishFrame(await broker.publishChannel(), frame),
               listen: (id, onInput) => listenForInput(takeoverChannel, id, onInput),
            },
            { limitMs: 90_000 }
         )

         // The owner sees the page first, which also proves the worker is listening for inputs.
         await expect.poll(() => frames.length, { timeout: 30_000 }).toBeGreaterThan(0)

         const [first] = frames

         expect(first?.width).toBeGreaterThan(300)
         expect(
            Buffer.from(first?.jpeg ?? '', 'base64')
               .subarray(0, 2)
               .toString('hex')
         ).toBe('ffd8')

         // A click is a fraction of the picture, so it lands on the button however the picture is scaled.
         const at = (x: number, y: number): TakeoverInput => ({
            kind: 'click',
            x: x / (first?.width ?? 1),
            y: y / (first?.height ?? 1),
         })

         sendInput(at(200, 140))
         sendInput(at(200, 320))
         sendInput({
            kind: 'type',
            text: '123456',
         })
         sendInput({ kind: 'done' })

         await expect(waiting).resolves.toBe('done')

         const text = await session.pageText()

         expect(text).toContain('clicked;')
         expect(text).toContain('typed:123456;')
      } finally {
         await session.close()
         await takeoverChannel.close().catch(() => undefined)
         await ownerChannel.close().catch(() => undefined)
      }
   })
})
