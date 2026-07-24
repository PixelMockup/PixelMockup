module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run preview -- --host 127.0.0.1 --port 4174',
      startServerReadyPattern: 'Local:',
      url: ['http://127.0.0.1:4174/'],
      numberOfRuns: 1,
      settings: {
        preset: 'desktop',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.5 }],
        'categories:accessibility': ['error', { minScore: 0.7 }],
        'categories:best-practices': ['warn', { minScore: 0.7 }],
        'categories:seo': ['warn', { minScore: 0.5 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
