const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths || {}, { prefix: '<rootDir>/' }),
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          ...compilerOptions,
          types: ['jest', 'node'],
        },
      },
    ],
  },
};
