import { reduce_ } from "../Array"
import { readService } from "../Effect/has"
import type { DefaultEnv, Runtime } from "../Effect/runtime"
import { makeRuntime } from "../Effect/runtime"
import { pipe, tuple } from "../Function"
import { mergeEnvironments } from "../Has"
import type { Managed } from "../Managed/managed"
import type { Finalizer } from "../Managed/releaseMap"
import * as RM from "../RefM"
import type { Erase, UnionToIntersection } from "../Utils"
import * as T from "./deps"
import { Layer } from "./Layer"
import { HasMemoMap, MemoMap } from "./MemoMap"

export { Layer } from "./Layer"

export type AsyncR<R, A> = Layer<unknown, R, never, A>

export function pure<T>(has: T.Tag<T>) {
  return (resource: T) =>
    new Layer<never, unknown, never, T.Has<T>>(
      T.managedChain_(T.fromEffect(T.succeedNow(resource)), (a) =>
        environmentFor(has, a)
      )
    )
}

export function prepare<T>(has: T.Tag<T>) {
  return <S, R, E, A extends T>(acquire: T.Effect<S, R, E, A>) => ({
    open: <S1, R1, E1>(open: (_: A) => T.Effect<S1, R1, E1, any>) => ({
      release: <S2, R2>(release: (_: A) => T.Effect<S2, R2, never, any>) =>
        fromManaged(has)(
          T.managedChain_(
            T.makeExit_(acquire, (a) => release(a)),
            (a) => T.fromEffect(T.map_(open(a), () => a))
          )
        )
    }),
    release: <S2, R2>(release: (_: A) => T.Effect<S2, R2, never, any>) =>
      fromManaged(has)(T.makeExit_(acquire, (a) => release(a)))
  })
}

export function create<T>(has: T.Tag<T>) {
  return {
    fromEffect: fromEffect(has),
    fromManaged: fromManaged(has),
    pure: pure(has),
    prepare: prepare(has)
  }
}

export function fromEffect<T>(has: T.Tag<T>) {
  return <S, R, E>(resource: T.Effect<S, R, E, T>) =>
    new Layer<S, R, E, T.Has<T>>(
      T.managedChain_(T.fromEffect(resource), (a) => environmentFor(has, a))
    )
}

export function fromManaged<T>(has: T.Tag<T>) {
  return <S, R, E>(resource: T.Managed<S, R, E, T>) =>
    new Layer<S, R, E, T.Has<T>>(
      T.managedChain_(resource, (a) => environmentFor(has, a))
    )
}

export function fromFunction<B>(tag: T.Tag<B>) {
  return <A>(f: (a: A) => B) => fromEffect(tag)(T.access(f))
}

export function fromRawManaged<S, R, E, A>(resource: T.Managed<S, R, E, A>) {
  return new Layer<S, R, E, A>(resource)
}

export function fromRawEffect<S, R, E, A>(resource: T.Effect<S, R, E, A>) {
  return new Layer<S, R, E, A>(T.fromEffect(resource))
}

export function fromRawFunction<A, B>(f: (a: A) => B) {
  return fromRawEffect(T.access(f))
}

export function zip_<S, R, E, A, S2, R2, E2, A2>(
  left: Layer<S, R, E, A>,
  right: Layer<S2, R2, E2, A2>
) {
  return new Layer<S | S2, R & R2, E | E2, readonly [A, A2]>(
    T.managedChain_(left.build, (l) =>
      T.managedChain_(right.build, (r) =>
        T.fromEffect(T.effectTotal(() => tuple(l, r)))
      )
    )
  )
}

export function zip<S2, R2, E2, A2>(right: Layer<S2, R2, E2, A2>) {
  return <S, R, E, A>(left: Layer<S, R, E, A>) => zip_(left, right)
}

export function merge_<S, R, E, A, S2, R2, E2, A2>(
  left: Layer<S, R, E, A>,
  right: Layer<S2, R2, E2, A2>
) {
  return new Layer<S | S2, R & R2, E | E2, A & A2>(
    T.managedChain_(left.build, (l) =>
      T.managedChain_(right.build, (r) =>
        T.fromEffect(T.effectTotal(() => ({ ...l, ...r })))
      )
    )
  )
}

export function merge<S2, R2, E2, A2>(right: Layer<S2, R2, E2, A2>) {
  return <S, R, E, A>(left: Layer<S, R, E, A>) => merge_(left, right)
}

export function using<S2, R2, E2, A2>(right: Layer<S2, R2, E2, A2>) {
  return <S, R, E, A>(left: Layer<S, R, E, A>) =>
    using_<S, R, E, A, S2, R2, E2, A2>(left, right)
}

export function using_<S, R, E, A, S2, R2, E2, A2>(
  left: Layer<S, R, E, A>,
  right: Layer<S2, R2, E2, A2>
) {
  return new Layer<S | S2, Erase<R, A2> & R2, E | E2, A & A2>(
    T.managedChain_(right.build, (a2) =>
      T.managedMap_(
        T.managedProvideSome_(left.build, (r0: R) => ({
          ...r0,
          ...a2
        })),
        (a) => ({ ...a2, ...a })
      )
    )
  )
}

export function consuming<S2, R2, E2, A2>(right: Layer<S2, R2, E2, A2>) {
  return <S, R, E, A>(left: Layer<S, R & A2, E, A>) =>
    consuming_<S, R, E, A, S2, R2, E2, A2>(left, right)
}

export function consuming_<S, R, E, A, S2, R2, E2, A2>(
  left: Layer<S, R & A2, E, A>,
  right: Layer<S2, R2, E2, A2>
) {
  return new Layer<S | S2, R & R2, E | E2, A & A2>(
    T.managedChain_(right.build, (a2) =>
      T.managedMap_(
        T.managedProvideSome_(left.build, (r0: R & R2) => ({
          ...r0,
          ...a2
        })),
        (a) => ({ ...a2, ...a })
      )
    )
  )
}

export function mergePar<S2, R2, E2, A2>(right: Layer<S2, R2, E2, A2>) {
  return <S, R, E, A>(left: Layer<S, R, E, A>) => mergePar_(left, right)
}

export function mergePar_<S, R, E, A, S2, R2, E2, A2>(
  left: Layer<S, R, E, A>,
  right: Layer<S2, R2, E2, A2>
) {
  return new Layer<unknown, R & R2, E | E2, A & A2>(
    T.managedChain_(
      T.managedZipWithPar_(left.build, right.build, (a, b) => [a, b] as const),
      ([l, r]) => T.fromEffect(T.effectTotal(() => ({ ...l, ...r })))
    )
  )
}

export type MergeS<Ls extends Layer<any, any, any, any>[]> = {
  [k in keyof Ls]: [Ls[k]] extends [Layer<infer X, any, any, any>] ? X : never
}[number]

export type MergeR<Ls extends Layer<any, any, any, any>[]> = UnionToIntersection<
  {
    [k in keyof Ls]: [Ls[k]] extends [Layer<any, infer X, any, any>]
      ? unknown extends X
        ? never
        : X
      : never
  }[number]
>

export type MergeE<Ls extends Layer<any, any, any, any>[]> = {
  [k in keyof Ls]: [Ls[k]] extends [Layer<any, any, infer X, any>] ? X : never
}[number]

export type MergeA<Ls extends Layer<any, any, any, any>[]> = UnionToIntersection<
  {
    [k in keyof Ls]: [Ls[k]] extends [Layer<any, any, any, infer X>]
      ? unknown extends X
        ? never
        : X
      : never
  }[number]
>

export function all<Ls extends Layer<any, any, any, any>[]>(
  ...ls: Ls & { 0: Layer<any, any, any, any> }
): Layer<MergeS<Ls>, MergeR<Ls>, MergeE<Ls>, MergeA<Ls>> {
  return new Layer(
    T.managedMap_(
      T.managedForeach_(ls, (l) => l.build),
      (ps) => reduce_(ps, {} as any, (b, a) => ({ ...b, ...a }))
    )
  )
}

export function allPar<Ls extends Layer<any, any, any, any>[]>(
  ...ls: Ls & { 0: Layer<any, any, any, any> }
): Layer<unknown, MergeR<Ls>, MergeE<Ls>, MergeA<Ls>> {
  return new Layer(
    T.managedMap_(
      T.foreachPar_(ls, (l) => l.build),
      (ps) => reduce_(ps, {} as any, (b, a) => ({ ...b, ...a }))
    )
  )
}

export function allParN(n: number) {
  return <Ls extends Layer<any, any, any, any>[]>(
    ...ls: Ls & { 0: Layer<any, any, any, any> }
  ): Layer<unknown, MergeR<Ls>, MergeE<Ls>, MergeA<Ls>> =>
    new Layer(
      T.managedMap_(
        T.foreachParN_(n)(ls, (l) => l.build),
        (ps) => reduce_(ps, {} as any, (b, a) => ({ ...b, ...a }))
      )
    )
}

function environmentFor<T>(
  has: T.Tag<T>,
  a: T
): T.Managed<never, unknown, never, T.Has<T>>
function environmentFor<T>(has: T.Tag<T>, a: T): T.Managed<never, unknown, never, any> {
  return T.fromEffect(
    T.access((r) => ({
      [has.key]: mergeEnvironments(has, r, a as any)[has.key]
    }))
  )
}

/**
 * Type level bound to make sure a layer is complete
 */
export function main<S, E, A>(layer: Layer<S, DefaultEnv, E, A>) {
  return layer
}

/**
 * Embed the requird environment in a region
 */
export function region<K, T>(h: T.Tag<T.Region<T, K>>) {
  return <S, R, E>(_: Layer<S, R, E, T>): Layer<S, R, E, T.Has<T.Region<T, K>>> =>
    pipe(
      fromRawEffect(T.access((r: T): T.Has<T.Region<T, K>> => ({ [h.key]: r } as any))),
      consuming(_)
    )
}

/**
 * Converts a layer to a managed runtime
 */
export function toRuntime<S, R, E, A>(
  _: Layer<S, R, E, A>
): Managed<S, R, E, Runtime<A>> {
  return T.managedMap_(_.build, makeRuntime)
}

/**
 * A default memoMap is included in DefaultEnv,
 * this can be used to "scope" a portion of layers to use a different memo map
 */
export const memoMap = create(HasMemoMap).fromEffect(
  pipe(
    RM.makeRefM<
      ReadonlyMap<Layer<any, any, any, any>, readonly [T.AsyncE<any, any>, Finalizer]>
    >(new Map()),
    T.map((ref) => new MemoMap(ref))
  )
)

/**
 * Memoize the current layer using a MemoMap
 */
export function memo<S, R, E, A>(
  layer: Layer<S, R, E, A>
): Layer<unknown, T.Has<MemoMap> & R, E, A> {
  return pipe(
    T.fromEffect(readService(HasMemoMap)),
    T.managedChain((m) => m.getOrElseMemoize(layer)),
    fromRawManaged
  )
}

/**
 * Returns a fresh version of a potentially memoized layer,
 * note that this will override the memoMap for the layer and its children
 */
export function fresh<S, R, E, A>(layer: Layer<S, R, E, A>): Layer<S, R, E, A> {
  return pipe(layer, consuming(memoMap))
}

/**
 * Maps the output of the layer using f
 */
export function map<A, B>(f: (a: A) => B) {
  return <S, R, E>(fa: Layer<S, R, E, A>): Layer<S, R, E, B> => map_(fa, f)
}

/**
 * Maps the output of the layer using f
 */
export function map_<S, R, E, A, B>(
  fa: Layer<S, R, E, A>,
  f: (a: A) => B
): Layer<S, R, E, B> {
  return new Layer(T.managedMap_(fa.build, f))
}

/**
 * Chains the output of the layer using f
 */
export function chain<S2, R2, E2, A, B>(f: (a: A) => Layer<S2, R2, E2, B>) {
  return <S, R, E>(fa: Layer<S, R, E, A>): Layer<S | S2, R & R2, E | E2, B> =>
    chain_(fa, f)
}

/**
 * Chains the output of the layer using f
 */
export function chain_<S, R, E, A, S2, R2, E2, B>(
  fa: Layer<S, R, E, A>,
  f: (a: A) => Layer<S2, R2, E2, B>
) {
  return new Layer(T.managedChain_(fa.build, (x) => f(x).build))
}

/**
 * Flatten `Layer<S, R, E, Layer<S2, R2, E2, A>>`
 */
export function flatten<S, R, E, S2, R2, E2, B>(
  ffa: Layer<S, R, E, Layer<S2, R2, E2, B>>
): Layer<S | S2, R & R2, E | E2, B> {
  return new Layer(T.managedChain_(ffa.build, (i) => i.build))
}
