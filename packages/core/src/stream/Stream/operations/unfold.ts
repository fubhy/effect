import { Chunk } from "../../../collection/immutable/Chunk"
import { Tuple } from "../../../collection/immutable/Tuple"
import type { LazyArg } from "../../../data/Function"
import type { Option } from "../../../data/Option"
import { Stream } from "../definition"

/**
 * Creates a stream by peeling off the "layers" of a value of type `S`.
 *
 * @tsplus static ets/StreamOps unfold
 */
export function unfold<S, A>(
  s: LazyArg<S>,
  f: (s: S) => Option<Tuple<[A, S]>>,
  __tsplusTrace?: string
): Stream<unknown, never, A> {
  return Stream.unfoldChunk(s, (s) =>
    f(s).map(({ tuple: [a, s] }) => Tuple(Chunk.single(a), s))
  )
}
