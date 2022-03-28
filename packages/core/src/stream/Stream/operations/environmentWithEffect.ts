import type { Effect } from "../../../io/Effect"
import { Stream } from "../definition"

/**
 * Accesses the environment of the stream in the context of an effect.
 *
 * @tsplus static ets/StreamOps environmentWithEffect
 */
export function environmentWithEffect<R0, R, E, A>(
  f: (r: R0) => Effect<R, E, A>,
  __tsplusTrace?: string
): Stream<R0 & R, E, A> {
  return Stream.environment<R0>().mapEffect(f)
}
