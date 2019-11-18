import { flatMap, makePattern, knitPattern } from "..";

describe("Pattern Knit", () => {
  it("should make a thing.", async () => {
    const thing = makePattern({
      knit: () => Promise.resolve("thing"),
    });
    expect(await knitPattern(thing)).toEqual({
      result: "thing",
      deps: {},
    });
  });

  it("should handle async knitting.", async () => {
    const delay = makePattern({
      knit: async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 50);
        });
        return "delayvalue";
      },
    });
    expect(await knitPattern(delay)).toEqual({
      result: "delayvalue",
      deps: {},
    });
  });

  it("should handle exceptional knitting.", () => {
    const throwAble = makePattern({
      knit: async () => {
        throw new Error("Can't do this!");
      },
    });
    return expect(knitPattern(throwAble)).rejects.toThrow("Can't do this!");
  });

  it("should handle/throw on cycles.", async () => {
    const cycle1 = makePattern({
      deps: {},
      knit: async () => {
        return "thing";
      },
    });
    const cycle2 = makePattern({
      deps: {
        cycle1,
      },
      knit: async () => {
        return "thing";
      },
    });
    const cycle1WithCycle2Ref = {
      ...cycle1,
      deps: {
        cycle2,
      },
    };
    return expect(knitPattern(cycle1WithCycle2Ref)).rejects.toThrow("Pattern has a cycle.");
  });

  it("should handle depdency chains with depsWith.", async () => {
    const one = makePattern({
      knit: async ({ depsWith }) => `one: ${JSON.stringify(depsWith.sort())}`,
    });
    const two = makePattern({
      deps: {
        one,
      },
      depsWith: {
        one: "oneFromTwo",
      },
      knit: async ({ depsWith }) => `two: ${JSON.stringify(depsWith.sort())}`,
    });
    const three = makePattern({
      deps: {
        one,
        two,
      },
      depsWith: {
        one: "oneFromThree",
        two: "twoFromThree",
      },
      knit: async ({ depsWith }) => `three: ${JSON.stringify(depsWith)}`,
    });
    expect(await knitPattern(three)).toEqual({
      result: "three: []",
      deps: {
        one: 'one: ["oneFromThree","oneFromTwo"]',
        two: 'two: ["twoFromThree"]',
      },
    });
  });

  it("should allow operators.", async () => {
    const basic = makePattern({
      knit: () => Promise.resolve("basic"),
    });
    const enhanced = flatMap(basic, async ({ knit }) => {
      const original = await knit();
      return `${original} enhanced`;
    });
    expect(await knitPattern(enhanced)).toEqual({
      result: "basic enhanced",
      deps: {},
    });
  });
});
