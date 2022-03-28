import { List } from "../../../src/collection/immutable/List"
import { Tuple } from "../../../src/collection/immutable/Tuple"
import { constVoid } from "../../../src/data/Function"
import { Option } from "../../../src/data/Option"
import { Exit } from "../../../src/io/Exit"
import { Ref } from "../../../src/io/Ref"
import { Channel } from "../../../src/stream/Channel"
import { ChildExecutorDecision } from "../../../src/stream/Channel/ChildExecutorDecision"
import { UpstreamPullStrategy } from "../../../src/stream/Channel/UpstreamPullStrategy"

describe("Channel", () => {
  describe("concatMap", () => {
    it("plain", async () => {
      const program = Channel.writeAll(1, 2, 3)
        .concatMap((i) => Channel.writeAll(i, i))
        .runCollect()

      const {
        tuple: [chunk, _]
      } = await program.unsafeRunPromise()

      expect(chunk.toArray()).toEqual([1, 1, 2, 2, 3, 3])
    })

    it("complex", async () => {
      const program = Channel.writeAll(1, 2)
        .concatMap((i) => Channel.writeAll(i, i))
        .mapOut((i) => ({ first: i }))
        .concatMap((i) => Channel.writeAll(i, i))
        .mapOut((n) => ({ second: n }))
        .runCollect()

      const {
        tuple: [chunk, _]
      } = await program.unsafeRunPromise()

      expect(chunk.toArray()).toEqual([
        { second: { first: 1 } },
        { second: { first: 1 } },
        { second: { first: 1 } },
        { second: { first: 1 } },
        { second: { first: 2 } },
        { second: { first: 2 } },
        { second: { first: 2 } },
        { second: { first: 2 } }
      ])
    })

    it("read from inner conduit", async () => {
      const source = Channel.writeAll(1, 2, 3, 4)
      const reader = Channel.read<number>().flatMap((n) => Channel.write(n))
      const readers = Channel.writeAll(undefined, undefined).concatMap(
        () => reader > reader
      )
      const program = (source >> readers).runCollect()

      const {
        tuple: [chunk, _]
      } = await program.unsafeRunPromise()

      expect(chunk.toArray()).toEqual([1, 2, 3, 4])
    })

    it("downstream failure", async () => {
      const program = Channel.write(0)
        .concatMap(() => Channel.fail("error"))
        .runCollect()

      const result = await program.unsafeRunPromiseExit()

      expect(result.untraced()).toEqual(Exit.fail("error"))
    })

    it("upstream acquireReleaseOut + downstream failure", async () => {
      const program = Ref.make(List.empty<string>()).flatMap((events) => {
        const event = (label: string) => events.update((list) => list.append(label))

        const conduit = Channel.acquireReleaseOutWith(event("Acquired"), () =>
          event("Released")
        )
          .concatMap(() => Channel.fail("error"))
          .runDrain()
          .exit()

        return conduit.zip(events.get())
      })

      const {
        tuple: [exit, events]
      } = await program.unsafeRunPromise()

      expect(exit.untraced()).toEqual(Exit.fail("error"))
      expect(events.toArray()).toEqual(["Acquired", "Released"])
    })

    it("multiple concatMaps with failure in first", async () => {
      const program = Channel.write(undefined)
        .concatMap(() => Channel.write(Channel.fail("error")))
        .concatMap((e) => e)
        .runCollect()

      const result = await program.unsafeRunPromiseExit()

      expect(result.untraced()).toEqual(Exit.fail("error"))
    })

    it("concatMap with failure then flatMap", async () => {
      const program = Channel.write(undefined)
        .concatMap(() => Channel.fail("error"))
        .flatMap(() => Channel.write(undefined))
        .runCollect()

      const result = await program.unsafeRunPromiseExit()

      expect(result.untraced()).toEqual(Exit.fail("error"))
    })

    it("multiple concatMaps with failure in first and catchAll in second", async () => {
      const program = Channel.write(undefined)
        .concatMap(() => Channel.write(Channel.fail("error")))
        .concatMap((e) => e.catchAllCause(() => Channel.fail("error2")))
        .runCollect()

      const result = await program.unsafeRunPromiseExit()

      expect(result.untraced()).toEqual(Exit.fail("error2"))
    })

    it("done value combination", async () => {
      const program = Channel.writeAll(1, 2, 3)
        .as(List("Outer-0"))
        .concatMapWith(
          (i) => Channel.write(i).as(List(`Inner-${i}`)),
          (a, b) => a + b,
          (a, b) => Tuple(a, b)
        )
        .runCollect()

      const {
        tuple: [
          chunk,
          {
            tuple: [list1, list2]
          }
        ]
      } = await program.unsafeRunPromise()

      expect(chunk.toArray()).toEqual([1, 2, 3])
      expect(list1.toArray()).toEqual(["Inner-1", "Inner-2", "Inner-3"])
      expect(list2.toArray()).toEqual(["Outer-0"])
    })

    it("custom 1", async () => {
      const program = Channel.writeAll(1, 2, 3, 4)
        .concatMapWithCustom(
          (x) =>
            Channel.writeAll(
              Option.some(Tuple(x, 1)),
              Option.none,
              Option.some(Tuple(x, 2)),
              Option.none,
              Option.some(Tuple(x, 3)),
              Option.none,
              Option.some(Tuple(x, 4))
            ),
          constVoid,
          constVoid,
          (pullRequest) => {
            switch (pullRequest._tag) {
              case "Pulled": {
                return UpstreamPullStrategy.PullAfterNext(Option.none)
              }
              case "NoUpstream": {
                return UpstreamPullStrategy.PullAfterAllEnqueued(Option.none)
              }
            }
          },
          (element) =>
            element.fold(
              ChildExecutorDecision.Yield,
              () => ChildExecutorDecision.Continue
            )
        )
        .runCollect()
        .map((tuple) => tuple.get(0).compact())

      const result = await program.unsafeRunPromise()

      expect(result.toArray()).toEqual([
        Tuple(1, 1),
        Tuple(2, 1),
        Tuple(3, 1),
        Tuple(4, 1),
        Tuple(1, 2),
        Tuple(2, 2),
        Tuple(3, 2),
        Tuple(4, 2),
        Tuple(1, 3),
        Tuple(2, 3),
        Tuple(3, 3),
        Tuple(4, 3),
        Tuple(1, 4),
        Tuple(2, 4),
        Tuple(3, 4),
        Tuple(4, 4)
      ])
    })

    it("custom 2", async () => {
      const program = Channel.writeAll(1, 2, 3, 4)
        .concatMapWithCustom(
          (x) =>
            Channel.writeAll(
              Option.some(Tuple(x, 1)),
              Option.none,
              Option.some(Tuple(x, 2)),
              Option.none,
              Option.some(Tuple(x, 3)),
              Option.none,
              Option.some(Tuple(x, 4))
            ),
          constVoid,
          constVoid,
          () => UpstreamPullStrategy.PullAfterAllEnqueued(Option.none),
          (element) =>
            element.fold(
              ChildExecutorDecision.Yield,
              () => ChildExecutorDecision.Continue
            )
        )
        .runCollect()
        .map((tuple) => tuple.get(0).compact())

      const result = await program.unsafeRunPromise()

      expect(result.toArray()).toEqual([
        Tuple(1, 1),
        Tuple(2, 1),
        Tuple(1, 2),
        Tuple(3, 1),
        Tuple(2, 2),
        Tuple(1, 3),
        Tuple(4, 1),
        Tuple(3, 2),
        Tuple(2, 3),
        Tuple(1, 4),
        Tuple(4, 2),
        Tuple(3, 3),
        Tuple(2, 4),
        Tuple(4, 3),
        Tuple(3, 4),
        Tuple(4, 4)
      ])
    })
  })
})
