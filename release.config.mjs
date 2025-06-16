// @ts-check

/**
 * @type {Partial<import('semantic-release').GlobalConfig>}
 */
export default {
  preset: "conventionalcommits",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        releaseRules: [{ type: "metadata", release: "patch" }],
      },
    ],
    "@semantic-release/release-notes-generator",
    "@semantic-release/npm",
    "@semantic-release/github",
  ],
};
