import { describe, expect, it } from 'vitest';
import { addCardToState, getAiTurnPlan, getGameStage, type CardState } from './game';

const baseState: CardState = {
playerCards: [],
aiCards: [],
communityCards: []
};

describe('addCardToState', () => {
it('prevents duplicate cards across contexts', () => {
const first = addCardToState(baseState, 'player', { rank: 'A', suit: 'spades' });
expect(first.ok).toBe(true);
if (!first.ok) return;

const duplicate = addCardToState(first.state, 'ai', { rank: 'A', suit: 'spades' });
expect(duplicate.ok).toBe(false);
if (duplicate.ok) return;
expect(duplicate.error).toContain('already exists');
});

it('caps community cards at five', () => {
let state = baseState;
for (const rank of ['A', 'K', 'Q', 'J', '10'] as const) {
const next = addCardToState(state, 'community', { rank, suit: 'hearts' });
expect(next.ok).toBe(true);
if (!next.ok) return;
state = next.state;
}

const overflow = addCardToState(state, 'community', { rank: '9', suit: 'hearts' });
expect(overflow.ok).toBe(false);
});
});

describe('stage + AI turn planning', () => {
it('tracks table stage based on community cards count', () => {
expect(getGameStage([])).toBe('preflop');
expect(getGameStage([
{ rank: 'A', suit: 'spades' },
{ rank: 'K', suit: 'spades' },
{ rank: 'Q', suit: 'spades' }
])).toBe('flop');
});

it('raises with strong preflop pair', () => {
const plan = getAiTurnPlan({
aiCards: [
{ rank: 'A', suit: 'spades' },
{ rank: 'A', suit: 'hearts' }
],
communityCards: [],
pot: 20,
toCall: 5
});
expect(plan.action).toBe('raise');
expect(plan.amount).toBeGreaterThan(5);
});

it('folds weak hand facing a bet', () => {
const plan = getAiTurnPlan({
aiCards: [
{ rank: '2', suit: 'spades' },
{ rank: '7', suit: 'clubs' }
],
communityCards: [],
pot: 20,
toCall: 10
});
expect(plan.action).toBe('fold');
});
});
