// package.json has "type": "module", so this config is an ES module. Import next/jest.js WITH
// the .js extension: `next` has no exports map, so Node cannot resolve a bare 'next/jest' here.
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

export default createJestConfig({
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
})
