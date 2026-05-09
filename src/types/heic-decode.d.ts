/**
 * Ambient types for `heic-decode` (the upstream package ships no .d.ts).
 *
 * The decoder takes an HEIC/HEIF buffer and returns RGBA pixel data plus
 * dimensions. The library wraps libheif via WASM and supports HEVC, the
 * compression used by iPhone photos that sharp's prebuilt libheif can't
 * decode.
 */
declare module 'heic-decode' {
  interface DecodeOptions {
    buffer: Buffer | Uint8Array;
    /** Index into the HEIC's image collection. Defaults to 0 (primary). */
    image?: number;
  }

  interface DecodedHeicImage {
    width: number;
    height: number;
    /** RGBA pixel buffer, 4 bytes per pixel, row-major. */
    data: ArrayBuffer;
  }

  type DecodeFn = (opts: DecodeOptions) => Promise<DecodedHeicImage>;

  const decode: DecodeFn & {
    /** List metadata for every image in a multi-image HEIC. */
    all: (opts: { buffer: Buffer | Uint8Array }) => Promise<Array<{ width: number; height: number; decode: () => Promise<DecodedHeicImage> }>>;
  };

  export default decode;
}
