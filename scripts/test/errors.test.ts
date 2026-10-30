import { describe, expect, it } from 'vitest';
import { messageOf } from '../src/lib/errors';

describe('messageOf', () => {
  it("an Error's message, anything else thrown as text", () => {
    expect(messageOf(new Error('broken'))).toBe('broken');
    expect(messageOf('a thrown string')).toBe('a thrown string');
    expect(messageOf(42)).toBe('42');
  });
});
