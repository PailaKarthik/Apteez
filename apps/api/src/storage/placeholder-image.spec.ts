import { generatePlaceholderPng } from './placeholder-image';

describe('generatePlaceholderPng', () => {
  it('emits a decodable PNG with the requested dimensions', () => {
    const png = generatePlaceholderPng({ width: 64, height: 48 });
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(64);
    expect(png.readUInt32BE(20)).toBe(48);
    expect(png.subarray(png.length - 8, png.length - 4).toString('ascii')).toBe('IEND');
  });

  it('rejects degenerate dimensions', () => {
    expect(() => generatePlaceholderPng({ width: 4, height: 48 })).toThrow(/dimensions/);
  });
});
