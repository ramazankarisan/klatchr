// Conventional Commits, enforced on commit-msg by husky.
// Types match the prefixes already used in this repo's history
// (feat, fix, docs, chore, refactor, test, ci, build, perf, style, revert).
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
