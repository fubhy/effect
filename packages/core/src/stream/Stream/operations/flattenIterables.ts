import { Chunk } from "../../../collection/immutable/Chunk"
import type { Stream } from "../definition"

/**
 * Submerges the iterables carried by this stream into the stream's structure,
 * while still preserving them.
 *
 * @tsplus fluent ets/Stream flattenIterables
 */
export function flattenIterables<R, E, A>(
  self: Stream<R, E, Iterable<A>>,
  __tsplusTrace?: string
): Stream<R, E, A> {
  return self.map((a) => Chunk.from(a)).flattenChunks()
}
