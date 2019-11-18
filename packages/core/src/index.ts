type UnwrapPatternResult<T> = T extends Pattern<infer D, infer R> ? R : never;
export type UnwrapDepPatternResults<T extends {}> = {
  [key in keyof T]: UnwrapDepPatternResults<T[key]>;
};
type WithLookup<T> = { [key in keyof T]?: unknown };
type ResultsLookup = { [id: string]: unknown };
export type StrictPatternLookup<D> = {
  [key in keyof D]: D[key] extends Pattern<infer DD> ? D[key] : never;
};
type PatternLookup = { [key: string]: Pattern<PatternLookup> };
type OperationParams<R> = { knit: () => Promise<R> };
type KnitParams<T> = { deps: UnwrapDepPatternResults<T>; depsWith: unknown[] };
export type Pattern<D extends StrictPatternLookup<D> = {}, R = unknown> = Readonly<{
  id: string;
  deps: D;
  knit: (params: KnitParams<D>) => Promise<R>;
  depsWith: WithLookup<D>;
}>;
type Params<D extends StrictPatternLookup<D> = {}, R = unknown> = {
  deps?: D;
  knit: Pattern<D, R>["knit"];
  depsWith?: WithLookup<D>;
};
type KnitResult<D, R> = Readonly<{
  deps: UnwrapDepPatternResults<D>;
  result: R;
}>;

let currentId = 0;

function traverse<D extends StrictPatternLookup<D>>(
  traversed: PatternLookup,
  pattern: Pattern<D>,
): PatternLookup {
  const { id } = pattern;
  return traversed[id]
    ? traversed
    : Object.values(pattern.deps as PatternLookup).reduce(traverse, {
        ...traversed,
        [id]: pattern,
      } as PatternLookup);
}

function getDepResults<D extends StrictPatternLookup<D>>(
  pattern: Pattern<D>,
  completed: ResultsLookup,
): UnwrapDepPatternResults<D> {
  return Object.entries(pattern.deps).reduce(
    (accum, [key, dep]) => ({
      ...accum,
      [key]: completed[(dep as Pattern<{}>).id],
    }),
    {} as UnwrapDepPatternResults<D>,
  );
}

function getDepsWithFor<D extends StrictPatternLookup<D>, R>(
  pattern: Pattern<D, R>,
  uncompleted: PatternLookup,
): unknown[] {
  const { id } = pattern;
  return Object.values(uncompleted).reduce((accum, { depsWith, deps }) => {
    const hasDepKey = Object.keys(deps).find((depKey) => deps[depKey].id === id);
    return hasDepKey && hasDepKey in depsWith ? accum.concat((depsWith as any)[hasDepKey]) : accum;
  }, []);
}

export function makePattern<D extends StrictPatternLookup<D>, R>(
  params: Params<D, R>,
): Pattern<D, R> {
  return Object.freeze({
    id: (++currentId).toString(),
    deps: Object.freeze({ ...(params.deps ?? ({} as D)) }),
    knit: params.knit,
    depsWith: Object.freeze({ ...(params.depsWith ?? {}) }),
  });
}

export function flatMap<D extends StrictPatternLookup<D>, R>(
  pattern: Pattern<D, R>,
  operation: (params: OperationParams<R>) => Promise<R>,
): Pattern<D, R> {
  return makePattern({
    deps: pattern.deps,
    depsWith: pattern.depsWith,
    knit: (params) =>
      operation({
        knit: () => pattern.knit(params),
      }),
  });
}

export async function knitPattern<D extends StrictPatternLookup<D>, R>(
  startPattern: Pattern<D, R>,
): Promise<KnitResult<D, R>> {
  const completed: ResultsLookup = {};
  const uncompleted = traverse({}, startPattern);
  while (true) {
    const roundOfWork = Object.values(uncompleted).filter((pattern) =>
      Object.values(pattern.deps).every((dep) => dep.id in completed),
    );
    if (!roundOfWork.length) {
      break;
    }
    const results = await Promise.all(
      roundOfWork.map((pattern) =>
        pattern.knit({
          deps: getDepResults(pattern, completed),
          depsWith: getDepsWithFor(pattern, uncompleted),
        }),
      ),
    );
    roundOfWork.forEach(({ id }, index) => {
      completed[id] = results[index];
      delete uncompleted[id];
    });
  }
  if (!(startPattern.id in completed)) {
    throw new Error("Pattern has a cycle.");
  }
  return Object.freeze({
    result: completed[startPattern.id] as R,
    deps: getDepResults(startPattern, completed),
  });
}
