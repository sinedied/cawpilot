// Patch vscode-jsonrpc to add exports map for ESM subpath resolution.
// The @github/copilot-sdk imports "vscode-jsonrpc/node" (no .js extension),
// but vscode-jsonrpc lacks an exports field, causing ERR_MODULE_NOT_FOUND
// under Node's strict ESM resolver.
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'node_modules', 'vscode-jsonrpc', 'package.json');
try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (!pkg.exports) {
    pkg.exports = {
      '.': './lib/node/main.js',
      './node': './node.js',
      './node.js': './node.js',
      './browser': './browser.js',
      './browser.js': './browser.js',
    };
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }
} catch {}
