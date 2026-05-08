export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];

export type Card = {
rank: Rank;
suit: Suit;
};

export type CardTarget = 'player' | 'ai' | 'community';

export type CardState = {
playerCards: Card[];
aiCards: Card[];
communityCards: Card[];
};

const MAX_BY_TARGET: Record<CardTarget, number> = {
player: 2,
ai: 2,
community: 5
};

const RANK_VALUE: Record<Rank, number> = {
A: 14,
K: 13,
Q: 12,
J: 11,
'10': 10,
'9': 9,
'8': 8,
'7': 7,
'6': 6,
'5': 5,
'4': 4,
'3': 3,
'2': 2
};

export function cardId(card: Card): string {
return `${card.rank}-${card.suit}`;
}

export function cardToLabel(card: Card): string {
const suit = card.suit[0].toUpperCase() + card.suit.slice(1);
return `${card.rank} of ${suit}`;
}

export function getGameStage(communityCards: Card[]): 'preflop' | 'flop' | 'turn' | 'river' {
switch (communityCards.length) {
case 0:
return 'preflop';
case 3:
return 'flop';
case 4:
return 'turn';
default:
return 'river';
}
}

function allCards(state: CardState): Card[] {
return [...state.playerCards, ...state.aiCards, ...state.communityCards];
}

function targetCards(state: CardState, target: CardTarget): Card[] {
if (target === 'player') return state.playerCards;
if (target === 'ai') return state.aiCards;
return state.communityCards;
}

export function addCardToState(state: CardState, target: CardTarget, card: Card): {
ok: true;
state: CardState;
} | {
ok: false;
error: string;
} {
if (!SUITS.includes(card.suit) || !RANKS.includes(card.rank)) {
return { ok: false, error: 'Detected card is invalid.' };
}

if (allCards(state).some((existing) => cardId(existing) === cardId(card))) {
return { ok: false, error: 'This card already exists in the current hand.' };
}

const cards = targetCards(state, target);
if (cards.length >= MAX_BY_TARGET[target]) {
return { ok: false, error: `${target} already has the maximum number of cards.` };
}

const nextState: CardState = {
playerCards: [...state.playerCards],
aiCards: [...state.aiCards],
communityCards: [...state.communityCards]
};

if (target === 'player') nextState.playerCards.push(card);
if (target === 'ai') nextState.aiCards.push(card);
if (target === 'community') nextState.communityCards.push(card);

return { ok: true, state: nextState };
}

function evaluatePreflop(cards: Card[]): number {
if (cards.length < 2) return 3;
const [a, b] = cards;
const aValue = RANK_VALUE[a.rank];
const bValue = RANK_VALUE[b.rank];
const high = Math.max(aValue, bValue);
const low = Math.min(aValue, bValue);
const isPair = a.rank === b.rank;
const suited = a.suit === b.suit;
const connected = high - low <= 1;

if (isPair) return high >= 10 ? 10 : 8;
if (high >= 13 && low >= 10) return suited ? 9 : 8;
if (suited && connected && high >= 10) return 7;
if (high >= 11) return 6;
if (suited || connected) return 5;
return 3;
}

function countPairs(cards: Card[]): number {
const counts = new Map<Rank, number>();
for (const card of cards) {
counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
}
let pairGroups = 0;
for (const count of counts.values()) {
if (count >= 2) pairGroups += 1;
}
return pairGroups;
}

function evaluatePostflop(aiCards: Card[], communityCards: Card[]): number {
const cards = [...aiCards, ...communityCards];
const pairs = countPairs(cards);
const hasTrips = cards.some((card) => cards.filter((c) => c.rank === card.rank).length >= 3);
if (hasTrips) return 10;
if (pairs >= 2) return 9;
if (pairs === 1) return 7;
return evaluatePreflop(aiCards);
}

export type AiTurnInput = {
aiCards: Card[];
communityCards: Card[];
toCall: number;
pot: number;
};

export type AiTurnPlan = {
action: 'fold' | 'check' | 'call' | 'raise';
amount?: number;
reason: string;
physicalInstructions: string[];
};

export function getAiTurnPlan({ aiCards, communityCards, toCall, pot }: AiTurnInput): AiTurnPlan {
const stage = getGameStage(communityCards);
const strength = stage === 'preflop' ? evaluatePreflop(aiCards) : evaluatePostflop(aiCards, communityCards);
const halfPotRaise = Math.max(2, Math.ceil(pot * 0.5));

if (toCall > 0 && strength <= 4) {
return {
action: 'fold',
reason: 'Weak hand strength against a bet.',
physicalInstructions: [
'Announce: "AI folds."',
'Push AI cards face down to the muck.'
]
};
}

if (strength >= 8) {
return {
action: 'raise',
amount: toCall + halfPotRaise,
reason: 'Strong hand strength warrants building the pot.',
physicalInstructions: [
`Announce: "AI raises to ${toCall + halfPotRaise}."`,
'Move the appropriate chips from the AI stack to the pot.'
]
};
}

if (toCall > 0) {
return {
action: 'call',
amount: toCall,
reason: 'Decent hand strength with manageable call size.',
physicalInstructions: [
`Announce: "AI calls ${toCall}."`,
'Move call chips from the AI stack to the pot.'
]
};
}

return {
action: 'check',
reason: 'No bet to call and hand strength does not justify a bluff raise.',
physicalInstructions: ['Announce: "AI checks."']
};
}
