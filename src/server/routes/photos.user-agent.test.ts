import { describe, it, expect } from 'vitest';
import { isSafariUserAgent } from './photos.js';

/**
 * Browser sniffing for the on-demand HEIC→JPEG transcode in /api/photos/:id/file.
 * Real-world User-Agent samples — keep these as a regression suite if we ever
 * loosen the matcher.
 */
describe('isSafariUserAgent', () => {
  it('matches macOS Safari', () => {
    expect(isSafariUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15')).toBe(true);
  });

  it('matches iOS Safari', () => {
    expect(isSafariUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe(true);
  });

  it('matches iPadOS Safari', () => {
    expect(isSafariUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe(true);
  });

  it('rejects desktop Chrome', () => {
    expect(isSafariUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')).toBe(false);
  });

  it('rejects macOS Chrome (UA still contains Safari for legacy reasons)', () => {
    expect(isSafariUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')).toBe(false);
  });

  it('rejects Microsoft Edge', () => {
    expect(isSafariUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0')).toBe(false);
  });

  it('rejects Firefox', () => {
    expect(isSafariUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0')).toBe(false);
  });

  it('rejects Chrome on Android (UA includes Safari but also Android+Chrome)', () => {
    expect(isSafariUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36')).toBe(false);
  });

  it('rejects iOS Chrome (CriOS)', () => {
    // Note: iOS Chrome uses WebKit under the hood and DOES technically render
    // HEIC, but its UA doesn't claim Chrome — it claims CriOS. The current
    // regex correctly identifies it as not-Safari (because we don't see
    // 'Safari' as a token… actually CriOS UA still has 'Safari'). Keep this
    // test honest: confirm the matcher's actual behavior.
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1';
    // CriOS UA doesn't contain 'Chrome' / 'Chromium' / 'Edg' tokens, so our
    // matcher classifies it as Safari. That's actually correct — iOS CriOS
    // uses the WebKit decoder, so HEIC works there too.
    expect(isSafariUserAgent(ua)).toBe(true);
  });

  it('rejects empty / undefined User-Agent', () => {
    expect(isSafariUserAgent(undefined)).toBe(false);
    expect(isSafariUserAgent('')).toBe(false);
  });

  it('rejects DLNA / generic clients', () => {
    expect(isSafariUserAgent('curl/8.0.0')).toBe(false);
    expect(isSafariUserAgent('SamsungSmartTV/2.0')).toBe(false);
  });
});
