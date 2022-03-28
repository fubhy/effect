import { Chunk } from "../../../src/collection/immutable/Chunk"
import { List } from "../../../src/collection/immutable/List"
import { Ref } from "../../../src/io/Ref"
import { Channel } from "../../../src/stream/Channel"
import { mapper } from "./test-utils"

describe("Channel", () => {
  describe("reads", () => {
    it("simple reads", async () => {
      const left = Channel.writeAll(1, 2, 3)
      const right = Channel.read<number>()
        .catchAll(() => Channel.succeedNow(4))
        .flatMap((i) => Channel.write({ whatever: i }))
      const conduit = left >> (right > right > right > right)
      const program = conduit.runCollect()

      const {
        tuple: [chunk, _]
      } = await program.unsafeRunPromise()

      expect(chunk.toArray()).toEqual([
        { whatever: 1 },
        { whatever: 2 },
        { whatever: 3 },
        { whatever: 4 }
      ])
    })

    it("pipeline", async () => {
      const effect = Channel.fromEffect(Ref.make(List.empty<number>())).flatMap(
        (ref) => {
          function inner(): Channel<
            unknown,
            unknown,
            number,
            unknown,
            never,
            number,
            void
          > {
            return Channel.readWith(
              (i: number) =>
                Channel.fromEffect(ref.update((list) => list.prepend(i))) >
                Channel.write(i) >
                inner(),
              () => Channel.unit,
              () => Channel.unit
            )
          }
          return inner() > Channel.fromEffect(ref.get())
        }
      )

      const program = (
        ((Channel.writeAll(1, 2) >> mapper((i: number) => i)) >>
          mapper((i: number) => List(i, i)).concatMap((list) =>
            Channel.writeAll(...list).as(undefined)
          )) >>
        effect
      ).runCollect()

      const {
        tuple: [chunk, result]
      } = await program.unsafeRunPromise()

      expect(chunk.toArray()).toEqual([1, 1, 2, 2])
      expect(result.toArray()).toEqual([2, 2, 1, 1])
    })

    it("another pipeline", async () => {
      const program = Ref.make(Chunk.empty<number>())
        .tap((ref) => {
          const intProducer: Channel<
            unknown,
            unknown,
            unknown,
            unknown,
            never,
            number,
            void
          > = Channel.writeAll(1, 2, 3, 4, 5)

          function readIntsN(
            n: number
          ): Channel<unknown, unknown, number, unknown, never, number, string> {
            return n > 0
              ? Channel.readWith(
                  (i: number) => Channel.write(i) > readIntsN(n - 1),
                  () => Channel.succeedNow("EOF"),
                  () => Channel.succeedNow("EOF")
                )
              : Channel.succeedNow("end")
          }

          function sum(
            label: string,
            acc: number
          ): Channel<unknown, unknown, number, unknown, unknown, never, void> {
            return Channel.readWith(
              (i: number) => sum(label, acc + i),
              () => Channel.fromEffect(ref.update((chunk) => chunk.append(acc))),
              () => Channel.fromEffect(ref.update((chunk) => chunk.append(acc)))
            )
          }

          const conduit =
            intProducer >>
            (readIntsN(2) >> sum("left", 0) > readIntsN(2) >> sum("right", 0))

          return conduit.run()
        })
        .flatMap((ref) => ref.get())

      const result = await program.unsafeRunPromise()

      expect(result.toArray()).toEqual([3, 7])
    })

    it("resources", async () => {
      const program = Ref.make(Chunk.empty<string>())
        .tap((events) => {
          const event = (label: string) => events.update((chunk) => chunk.append(label))

          const left = Channel.acquireReleaseOutWith(event("Acquire outer"), () =>
            event("Release outer")
          ).concatMap(() =>
            Channel.writeAll(1, 2, 3).concatMap((i) =>
              Channel.acquireReleaseOutWith(event(`Acquire ${i}`).as(i), () =>
                event(`Release ${i}`)
              )
            )
          )

          const read = Channel.read<number>().mapEffect((i) =>
            event(`Read ${i}`).asUnit()
          )

          const right = (read > read).catchAll(() => Channel.unit)

          return (left >> right).runDrain()
        })
        .flatMap((ref) => ref.get())

      const result = await program.unsafeRunPromise()

      expect(result.toArray()).toEqual([
        "Acquire outer",
        "Acquire 1",
        "Read 1",
        "Release 1",
        "Acquire 2",
        "Read 2",
        "Release 2",
        "Release outer"
      ])
    })
  })
})
