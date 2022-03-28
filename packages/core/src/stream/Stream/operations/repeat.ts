import { Chunk } from "../../../collection/immutable/Chunk"
import type { LazyArg } from "../../../data/Function"
import type { HasClock } from "../../../io/Clock"
import type { Schedule } from "../../../io/Schedule"
import { Channel } from "../../Channel"
import type { Stream } from "../definition"
import { StreamInternal } from "./_internal/StreamInternal"

/**
 * Repeats the entire stream using the specified schedule. The stream will
 * execute normally, and then repeat again according to the provided schedule.
 *
 * @tsplus fluent ets/Stream repeat
 */
export function repeatNow_<R, E, A, S, R2, B>(
  self: Stream<R, E, A>,
  schedule: LazyArg<Schedule.WithState<S, R2, unknown, B>>,
  __tsplusTrace?: string
): Stream<R & R2 & HasClock, E, A>
export function repeatNow_<R, E, A, R2, B>(
  self: Stream<R, E, A>,
  schedule: LazyArg<Schedule<R2, unknown, B>>,
  __tsplusTrace?: string
): Stream<R & R2 & HasClock, E, A> {
  return self.repeatEither(schedule).collectRight()
}

/**
 * Repeats the entire stream using the specified schedule. The stream will
 * execute normally, and then repeat again according to the provided schedule.
 */
export const repeatNow = Pipeable(repeatNow_)

/**
 * Repeats the provided value infinitely.
 *
 * @tsplus static ets/StreamOps repeat
 */
export function repeat<A>(
  a: LazyArg<A>,
  __tsplusTrace?: string
): Stream<unknown, never, A> {
  return new StreamInternal(
    Channel.succeed(a).flatMap((a) => Channel.write(Chunk.single(a)).repeated())
  )
}
