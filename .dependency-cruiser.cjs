/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make code harder to understand and test.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-test',
      severity: 'error',
      comment: 'Production code must not import test files.',
      from: { pathNot: '\\.(test|spec)\\.[tj]sx?$' },
      to: { path: '\\.(test|spec)\\.[tj]sx?$' },
    },
    {
      name: 'core-is-pure',
      severity: 'error',
      comment: 'packages/core imports nothing from games, protocol, or apps. It is the root.',
      from: { path: '^packages/core/' },
      to: { path: '^(packages/(games|protocol)|apps)/' },
    },
    {
      name: 'games-only-core',
      severity: 'error',
      comment: 'packages/games may import only core — not protocol, not apps.',
      from: { path: '^packages/games/' },
      to: { path: '^(packages/protocol|apps)/' },
    },
    {
      name: 'protocol-not-apps',
      severity: 'error',
      comment: 'packages/protocol must not import from apps.',
      from: { path: '^packages/protocol/' },
      to: { path: '^apps/' },
    },
    {
      name: 'server-not-web',
      severity: 'error',
      comment: 'apps/server and apps/web never import each other.',
      from: { path: '^apps/server/' },
      to: { path: '^apps/web/' },
    },
    {
      name: 'web-not-server',
      severity: 'error',
      comment: 'apps/web and apps/server never import each other.',
      from: { path: '^apps/web/' },
      to: { path: '^apps/server/' },
    },
    {
      name: 'core-games-are-pure-of-frameworks',
      severity: 'error',
      comment: 'core/games are pure: no react, nest, sockets, rxjs, or node builtins.',
      from: { path: '^packages/(core|games)/' },
      to: {
        dependencyTypes: ['npm', 'core'],
        pathNot: ['^zod$', '^packages/core/'],
        path: ['react', '@nestjs', '^ws$', 'socket.io', 'rxjs', '^node:'],
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'default'] },
  },
};
