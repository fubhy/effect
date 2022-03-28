import type { LazyArg } from "../../../data/Function"
import { constTrue } from "../../../data/Function"
import type { Effect } from "../../../io/Effect"
import { Sink } from "../definition"

/**
 * A sink that effectfully folds its inputs with the provided function and
 * initial state.
 *
 * @tsplus static ets/SinkOps foldLeftEffect
 */
export function foldLeftEffect<R, E, In, S>(
  z: LazyArg<S>,
  f: (s: S, input: In) => Effect<R, E, S>,
  __tsplusTrace?: string
): Sink<R, E, In, In, S> {
  return Sink.foldEffect(z, constTrue, f)
}
