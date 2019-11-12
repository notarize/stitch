module.exports = {
  clearMocks: true,
  globals: {
    "ts-jest": {
      diagnostics: {
        warnOnly: true,
      },
    },
  },
  moduleNameMapper: {
    "^@notarize\\/stitch-([^/]+)": "<rootDir>/packages/$1/src",
  },
  rootDir: __dirname,
  testMatch: ["<rootDir>/packages/*/src/**/__tests__/*.spec.ts"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  transformIgnorePatterns: ["/node_modules/"],
};
