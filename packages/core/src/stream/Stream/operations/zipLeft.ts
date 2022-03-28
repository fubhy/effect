import type { LazyArg } from "../../../data/Function"
import type { Stream } from "../definition"
import { zipLeftChunks } from "./_internal/zipLeftChunks"

/**
 * Zips this stream with another point-wise, but keeps only the outputs of
 * this stream.
 *
 * The new stream will end when one of the sides ends.
 *
 * @tsplus fluent ets/Stream zipLeft
 */
export function zipLeft_<R, E, A, R2, E2, A2>(
  self: Stream<R, E, A>,
  that: LazyArg<Stream<R2, E2, A2>>,
  __tsplusTrace?: string
): Stream<R & R2, E | E2, A> {
  return self.zipWithChunks(that, zipLeftChunks)
}

/**
 * Zips this stream with another point-wise, but keeps only the outputs of
 * this stream.
 *
 * The new stream will end when one of the sides ends.
 */
export const zipLeft = Pipeable(zipLeft_)
