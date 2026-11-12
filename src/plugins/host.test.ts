import { describe, expect, it } from 'vitest';
import { readInfo } from './host';

describe('plugin info', () => {
  it('reads the info export without running the plugin', () => {
    const code = `export const info = {\n  id: 'My Plugin!',\n  name: "Cool thing",\n  version: '1.2.0',\n  api: 1,\n};\nexport default function (api) {}`;
    expect(readInfo(code, 'x.js')).toEqual({ id: 'my-plugin-', name: 'Cool thing', version: '1.2.0', api: 1 });
  });

  it('falls back to the file name', () => {
    expect(readInfo('export default () => {}', 'Speed HUD.mjs')).toMatchObject({ id: 'speed-hud', name: 'Speed HUD' });
  });
});
