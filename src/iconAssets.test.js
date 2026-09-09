import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const text = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const hash = (path) => createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex');

describe('bộ icon phát hành', () => {
  it('chỉ khai báo một icon iOS/PWA và có manifest cache-bust theo phiên bản', () => {
    const html = text('../index.html');
    expect(html.match(/rel="apple-touch-icon"/g)).toHaveLength(1);
    expect(html.match(/rel="manifest"/g)).toHaveLength(1);
    expect(html).toContain('manifest.webmanifest?v=2.8.0');
  });

  it('AppIcon iOS dùng đúng ảnh nguồn 1024 hiện tại', () => {
    const catalog = JSON.parse(text('../ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json'));
    expect(catalog.images).toEqual([{ filename: 'AppIcon-512@2x.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }]);
    expect(hash('../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')).toBe(hash('../public/icon-1024.png'));
  });

  it('Android chỉ tham chiếu bộ launcher icon hiện tại', () => {
    const manifest = text('../android/app/src/main/AndroidManifest.xml');
    expect(manifest).toContain('android:icon="@mipmap/ic_launcher"');
    expect(manifest).toContain('android:roundIcon="@mipmap/ic_launcher_round"');
  });
});
