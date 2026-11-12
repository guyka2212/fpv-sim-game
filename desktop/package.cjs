// Packs desktop/electron + the built game (dist/) into a standalone Windows app folder.
// Usage: node desktop/package.cjs <outDir>
const path = require('path');
const { packager } = require('@electron/packager');

const root = path.join(__dirname, '..');
const out = process.argv[2] || path.join(root, 'app-build');
const electronVersion = require(path.join(root, 'node_modules', 'electron', 'package.json')).version;

packager({
  dir: path.join(__dirname, 'electron'),
  out,
  name: 'FlySim',
  executableName: 'FlySim',
  platform: 'win32',
  arch: 'x64',
  electronVersion,
  icon: path.join(__dirname, 'electron', 'icon.ico'),
  extraResource: [path.join(root, 'dist'), path.join(__dirname, 'xr', 'out', 'xr')],
  asar: true,
  overwrite: true,
  prune: false,
  appCopyright: 'guyka2212',
  win32metadata: { ProductName: 'FPV Sim', FileDescription: 'FPV Sim', CompanyName: 'guyka2212' },
})
  .then((dirs) => console.log('PACKED', dirs.join(', ')))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
