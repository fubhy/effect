import { Chunk } from "../../../collection/immutable/Chunk"
import type { LazyArg } from "../../../data/Function"
import { Stream } from "../definition"

/**
 * Splits strings on a delimiter.
 *
 * @tsplus fluent ets/Stream splitOn
 */
export function splitOn_<R, E>(
  self: Stream<R, E, string>,
  delimiter: LazyArg<string>,
  __tsplusTrace?: string
): Stream<R, E, string> {
  return Stream.succeed(delimiter).flatMap((delimiter) =>
    self
      .mapChunks((chunk) => chunk.flatMap(Chunk.from))
      .via(Stream.splitOnChunkFlatten(Chunk.from(delimiter)))
      .via(Stream.mapChunks((chunk) => Chunk.single(chunk.join(""))))
  )
}

/**
 * Splits strings on a delimiter.
 *
 * @tsplus static ets/StreamOps splitOn
 */
export const splitOn = Pipeable(splitOn_)
