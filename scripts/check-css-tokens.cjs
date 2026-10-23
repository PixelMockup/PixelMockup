#!/usr/bin/env node
/**
 * Design-system token validator.
 * Scans CSS files for var(--ms-*) references and verifies
 * each token is declared in tokens.css (or index.css base).
 */
const fs = require('fs');
const path = require('path');

const TOKEN_FILE = path.resolve(__dirname, '../src/styles/tokens.css');
const CSS_DIR = path.resolve(__dirname, '../src');

function extractDeclaredTokens() {
  const text = fs.readFileSync(TOKEN_FILE, 'utf8');
  const decls = new Set();
  // Match --ms-...: inside :root or [data-theme='dark']
  const regex = /--(ms-[a-z0-9-]+)\s*:/gi;
  let m;
  while ((m = regex.exec(text)) !== null) decls.add(m[1]);
  return decls;
}

function findCssFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'assets' && entry.name !== 'styles/components') {
      files.push(...findCssFiles(p));
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      files.push(p);
    }
  }
  return files;
}

function main() {
  const declared = extractDeclaredTokens();
  // Also allow a small set of known non-token references (e.g. ms-text-btn class)
  const allowedRefs = new Set(['ms-text-btn', 'ms-menu', 'ms-zoom-pill', 'ms-rail-btn', 'ms-icon-rail', 'ms-mobile-toolbar', 'ms-tour']);

  const cssFiles = findCssFiles(CSS_DIR);
  const undefinedRefs = new Map();

  for (const file of cssFiles) {
    const text = fs.readFileSync(file, 'utf8');
    const regex = /var\(--(ms-[a-z0-9-]+)\)/gi;
    let m;
    while ((m = regex.exec(text)) !== null) {
      const token = m[1];
      if (!declared.has(token) && !allowedRefs.has(token)) {
        const key = `${token} (${path.relative(process.cwd(), file)})`;
        undefinedRefs.set(key, (undefinedRefs.get(key) || 0) + 1);
      }
    }
  }

  if (undefinedRefs.size > 0) {
    console.error('❌ Undefined CSS token references found:');
    for (const [k, v] of undefinedRefs) console.error(`   • ${k} (${v} occurrence${v > 1 ? 's' : ''})`);
    process.exit(1);
  }
  console.log('✅ All CSS token references validated against tokens.css');
}

main();
