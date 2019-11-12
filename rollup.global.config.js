import TypescriptRollup from "rollup-plugin-typescript2";

function createConfig({ peerDependencies, dependencies, module, main }) {
  peerDependencies = peerDependencies || {};
  dependencies = dependencies || {};
  return {
    input: "src/index.ts",
    output: [
      {
        file: main,
        format: "cjs",
      },
      {
        file: module,
        format: "es",
      },
    ],
    external: (id) => {
      if (id in dependencies || id in peerDependencies) {
        return true;
      }
      const processedId = id.replace(/\/.*/, "");
      return processedId in dependencies || processedId in peerDependencies;
    },
    plugins: [TypescriptRollup()],
  };
}

export default createConfig;
