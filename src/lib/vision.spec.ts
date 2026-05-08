import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkGeminiConnection, parseCardText } from './vision';

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

describe('checkGeminiConnection', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('rejects an empty api key', async () => {
        await expect(checkGeminiConnection('')).resolves.toEqual({
            ok: false,
            message: 'Enter a Gemini API key before continuing.'
        });
    });

    it('accepts a successful gemini response', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({})
            })
        );

        await expect(checkGeminiConnection('test-key')).resolves.toEqual({
            ok: true,
            message: 'Gemini connection established.'
        });
    });

    it('rejects a failed gemini response', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                json: async () => ({})
            })
        );

        await expect(checkGeminiConnection('test-key')).resolves.toEqual({
            ok: false,
            message: 'Gemini connection failed. Check the API key and network access, then try again.'
        });
    });
});
