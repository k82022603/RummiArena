const nextJest = require("next/jest.js");

const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  // jest-dom matcher 는 각 테스트 파일에서 `import "@testing-library/jest-dom"` 로 개별 로드.
  // (Jest 29 의 setupFilesAfter* 계열 옵션이 next/jest 래핑과 충돌하는 사례를 Day 11 발견.)
  testEnvironment: "jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts?(x)"],
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/.next/",
    "<rootDir>/e2e/",
    "<rootDir>/test-results/",
    "<rootDir>/playwright-report/",
  ],
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
  collectCoverageFrom: [
    "src/lib/**/*.{ts,tsx}",
    "src/store/**/*.{ts,tsx}",
    "src/components/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/index.ts",
  ],
};

module.exports = createJestConfig(config);
