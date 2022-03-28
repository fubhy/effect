import { Tuple } from "../../collection/immutable/Tuple"
import { Either } from "../../data/Either"
import { Cause } from "../../io/Cause"
import type { UIO } from "../../io/Effect"
import { Effect } from "../../io/Effect"
import { Exit } from "../../io/Exit"
import { Promise } from "../../io/Promise"
import { Ref } from "../../io/Ref"
import { ImmutableQueue } from "../../support/ImmutableQueue"

/**
 * Producer-side view of `SingleProducerAsyncInput` for variance purposes.
 */
export interface AsyncInputProducer<Err, Elem, Done> {
  readonly emit: (el: Elem) => UIO<unknown>
  readonly done: (a: Done) => UIO<unknown>
  readonly error: (cause: Cause<Err>) => UIO<unknown>
  readonly awaitRead: UIO<unknown>
}

/**
 * Consumer-side view of `SingleProducerAsyncInput` for variance purposes.
 */
export interface AsyncInputConsumer<Err, Elem, Done> {
  readonly takeWith: <A>(
    onError: (cause: Cause<Err>) => A,
    onElement: (element: Elem) => A,
    onDone: (done: Done) => A
  ) => UIO<A>
}

export type State<Err, Elem, Done> =
  | StateEmpty
  | StateEmit<Err, Elem, Done>
  | StateError<Err>
  | StateDone<Done>

export const DoneTypeId = Symbol.for("@effect-ts/core/stream/Channel/Producer/Done")
export type DoneTypeId = typeof DoneTypeId

export class StateDone<Elem> {
  readonly _typeId: DoneTypeId = DoneTypeId
  constructor(readonly a: Elem) {}
}

export const ErrorTypeId = Symbol.for("@effect-ts/core/stream/Channel/Producer/Error")
export type ErrorTypeId = typeof ErrorTypeId

export class StateError<Err> {
  readonly _typeId: ErrorTypeId = ErrorTypeId
  constructor(readonly cause: Cause<Err>) {}
}

export const EmptyTypeId = Symbol.for("@effect-ts/core/stream/Channel/Producer/Empty")
export type EmptyTypeId = typeof EmptyTypeId

export class StateEmpty {
  readonly _typeId: EmptyTypeId = EmptyTypeId
  constructor(readonly notifyProducer: Promise<never, void>) {}
}

export const EmitTypeId = Symbol.for("@effect-ts/core/stream/Channel/Producer/Emit")
export type EmitTypeId = typeof EmitTypeId

export class StateEmit<Err, Elem, Done> {
  readonly _typeId: EmitTypeId = EmitTypeId
  constructor(
    readonly notifyConsumers: ImmutableQueue<Promise<Err, Either<Done, Elem>>>
  ) {}
}

/**
 * An MVar-like abstraction for sending data to channels asynchronously.
 * Designed for one producer and multiple consumers.
 *
 * Features the following semantics:
 *   - Buffer of size 1.
 *   - When emitting, the producer waits for a consumer to pick up the value to
 *     prevent "reading ahead" too much.
 *   - Once an emitted element is read by a consumer, it is cleared from the
 *     buffer, so that at most one consumer sees every emitted element.
 *   - When sending a done or error signal, the producer does not wait for a
 *     consumer to pick up the signal. The signal stays in the buffer after
 *     being read by a consumer, so it can be propagated to multiple consumers.
 *   - Trying to publish another emit/error/done after an error/done have
 *     already been published results in an interruption.
 *
 * @tsplus type ets/Channel/SingleProducerAsyncInput
 * @tsplus companion ets/Channel/SingleProducerAsyncInputOps
 */
export class SingleProducerAsyncInput<Err, Elem, Done>
  implements AsyncInputProducer<Err, Elem, Done>, AsyncInputConsumer<Err, Elem, Done>
{
  constructor(readonly ref: Ref<State<Err, Elem, Done>>) {}

  get take(): UIO<Exit<Either<Err, Done>, Elem>> {
    return this.takeWith<Exit<Either<Err, Done>, Elem>>(
      (cause) => Exit.failCause(cause.map(Either.left)),
      (element) => Exit.succeed(element),
      (done) => Exit.fail(Either.right(done))
    )
  }

  get close(): UIO<unknown> {
    return Effect.fiberId.flatMap((fiberId) => this.error(Cause.interrupt(fiberId)))
  }

  get awaitRead(): UIO<unknown> {
    return this.ref
      .modify((state) =>
        state._typeId === EmptyTypeId
          ? Tuple(state.notifyProducer.await(), state)
          : Tuple(Effect.unit, state)
      )
      .flatten()
  }

  emit(el: Elem): UIO<unknown> {
    return Promise.make<never, void>().flatMap((promise) =>
      this.ref
        .modify((state) => {
          switch (state._typeId) {
            case EmitTypeId: {
              const dequeued = state.notifyConsumers.dequeue()

              if (dequeued._tag === "Some") {
                const {
                  tuple: [notifyConsumer, notifyConsumers]
                } = dequeued.value

                return Tuple(
                  notifyConsumer.succeed(Either.right(el)),
                  notifyConsumers.size === 0
                    ? new StateEmpty(promise)
                    : new StateEmit(notifyConsumers)
                )
              }

              throw new Error("SingleProducerAsyncInput#emit: queue was empty")
            }
            case ErrorTypeId: {
              return Tuple(Effect.interrupt, state)
            }
            case DoneTypeId: {
              return Tuple(Effect.interrupt, state)
            }
            case EmptyTypeId: {
              return Tuple(state.notifyProducer.await(), state)
            }
          }
        })
        .flatten()
    )
  }

  done(a: Done): UIO<unknown> {
    return this.ref
      .modify((state) => {
        switch (state._typeId) {
          case EmitTypeId: {
            return Tuple(
              Effect.forEachDiscard(state.notifyConsumers, (promise) =>
                promise.succeed(Either.left(a))
              ),
              new StateDone(a)
            )
          }
          case ErrorTypeId: {
            return Tuple(Effect.interrupt, state)
          }
          case DoneTypeId: {
            return Tuple(Effect.interrupt, state)
          }
          case EmptyTypeId: {
            return Tuple(state.notifyProducer.await(), state)
          }
        }
      })
      .flatten()
  }

  error(cause: Cause<Err>): UIO<unknown> {
    return this.ref
      .modify((state) => {
        switch (state._typeId) {
          case EmitTypeId: {
            return Tuple(
              Effect.forEachDiscard(state.notifyConsumers, (promise) =>
                promise.failCause(cause)
              ),
              new StateError(cause)
            )
          }
          case ErrorTypeId: {
            return Tuple(Effect.interrupt, state)
          }
          case DoneTypeId: {
            return Tuple(Effect.interrupt, state)
          }
          case EmptyTypeId: {
            return Tuple(state.notifyProducer.await(), state)
          }
        }
      })
      .flatten()
  }

  takeWith<X>(
    onError: (cause: Cause<Err>) => X,
    onElement: (element: Elem) => X,
    onDone: (done: Done) => X
  ): UIO<X> {
    return Promise.make<Err, Either<Done, Elem>>().flatMap((promise) =>
      this.ref
        .modify((state) => {
          switch (state._typeId) {
            case EmitTypeId: {
              return Tuple(
                promise
                  .await()
                  .foldCause(onError, (either) => either.fold(onDone, onElement)),
                new StateEmit(state.notifyConsumers.push(promise))
              )
            }
            case ErrorTypeId: {
              return Tuple(Effect.succeed(onError(state.cause)), state)
            }
            case DoneTypeId: {
              return Tuple(Effect.succeed(onDone(state.a)), state)
            }
            case EmptyTypeId: {
              return Tuple(
                state.notifyProducer.succeed(undefined) >
                  promise
                    .await()
                    .foldCause(onError, (either) => either.fold(onDone, onElement)),
                new StateEmit(ImmutableQueue.single(promise))
              )
            }
          }
        })
        .flatten()
    )
  }
}

/**
 * Creates a `SingleProducerAsyncInput`.
 *
 * @tsplus static ets/Channel/SingleProducerAsyncInputOps make
 */
export function make<Err, Elem, Done>(): UIO<
  SingleProducerAsyncInput<Err, Elem, Done>
> {
  return Promise.make<never, void>()
    .flatMap((promise) => Ref.make<State<Err, Elem, Done>>(new StateEmpty(promise)))
    .map((ref) => new SingleProducerAsyncInput(ref))
}
