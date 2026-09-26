import { StructuredOutputService } from './structured-output.service';

describe('StructuredOutputService.extractJson', () => {
  it('extracts a JSON object embedded in prose', () => {
    const result = StructuredOutputService.extractJson(
      'Here is the result: {"a": 1, "b": [1, 2]} done.',
    );
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ a: 1, b: [1, 2] });
  });

  it('rejects output with no JSON object', () => {
    const result = StructuredOutputService.extractJson('Just some prose, no object here.');
    expect(result.ok).toBe(false);
  });

  it('rejects malformed and truncated JSON', () => {
    expect(StructuredOutputService.extractJson('{"a": }').ok).toBe(false);
    expect(StructuredOutputService.extractJson('{"a": {"b": 1').ok).toBe(false);
  });

  it('handles braces inside strings and escapes', () => {
    const result = StructuredOutputService.extractJson('{"text": "a } b \\" c {", "n": 2}');
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ text: 'a } b " c {', n: 2 });
  });
});
