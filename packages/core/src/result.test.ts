import { err, ok } from './result.js';

describe('result', () => {
  it('ok wraps a value', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
  });

  it('err wraps an error', () => {
    expect(err('boom')).toEqual({ ok: false, error: 'boom' });
  });
});
