import type { Chunk } from "../../../collection/immutable/Chunk"
import type { LazyArg, Predicate } from "../../../data/Function"
import { Channel } from "../../Channel"
import { Sink } from "../definition"
import { SinkInternal } from "./_internal/SinkInternal"

/**
 * A sink that folds its input chunks with the provided function, termination
 * predicate and initial state. The `cont` condition is checked only for the
 * initial value and at the end of processing of each chunk. `f` and `cont`
 * must preserve chunking-invariance.
 *
 * @tsplus static ets/SinkOps foldChunks
 */
export function foldChunks<In, S>(
  z: LazyArg<S>,
  cont: Predicate<S>,
  f: (s: S, input: Chunk<In>) => S,
  __tsplusTrace?: string
): Sink<unknown, never, In, unknown, S> {
  return Sink.suspend(new SinkInternal(reader(z(), cont, f)))
}

function reader<S, In>(
  z: S,
  cont: Predicate<S>,
  f: (s: S, input: Chunk<In>) => S,
  __tsplusTrace?: string
): Channel<unknown, never, Chunk<In>, unknown, never, never, S> {
  return cont(z)
    ? Channel.readWith(
        (chunk: Chunk<In>) => {
          const nextS = f(z, chunk)
          return reader(nextS, cont, f)
        },
        (err) => Channel.fail(err),
        () => Channel.succeedNow(z)
      )
    : Channel.succeedNow(z)
}
