import { describe, expect, it } from 'vitest';
import { parseCardText } from './vision';

describe('parseCardText', () => {
it('parses shorthand values', () => {
expect(parseCardText('Ah')).toEqual({ rank: 'A', suit: 'hearts' });
expect(parseCardText('10d')).toEqual({ rank: '10', suit: 'diamonds' });
});

it('parses verbose values', () => {
expect(parseCardText('queen of clubs')).toEqual({ rank: 'Q', suit: 'clubs' });
});

it('returns null for invalid text', () => {
expect(parseCardText('not a card')).toBeNull();
});
});
