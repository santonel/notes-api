export default {
    preset: 'ts-jest',
    resolver: 'ts-jest-resolver',
    testEnvironment: 'node',
    modulePathIgnorePatterns: ['<rootDir>/dist/'],
    setupFiles: ['./test/jest-setup-file.ts']
}