import type { Card, Rank, Suit } from './game';

export type VisionProvider = 'mock' | 'gemini';

export type GeminiConnectionCheck = {
ok: true;
message: string;
} | {
ok: false;
message: string;
};

const RANK_ALIASES: Record<string, Rank> = {
a: 'A',
ace: 'A',
k: 'K',
king: 'K',
q: 'Q',
queen: 'Q',
j: 'J',
jack: 'J',
'10': '10',
t: '10',
nine: '9',
'9': '9',
eight: '8',
'8': '8',
seven: '7',
'7': '7',
six: '6',
'6': '6',
five: '5',
'5': '5',
four: '4',
'4': '4',
three: '3',
'3': '3',
two: '2',
'2': '2'
};

const SUIT_ALIASES: Record<string, Suit> = {
s: 'spades',
spade: 'spades',
spades: 'spades',
'♠': 'spades',
h: 'hearts',
heart: 'hearts',
hearts: 'hearts',
'♥': 'hearts',
d: 'diamonds',
diamond: 'diamonds',
diamonds: 'diamonds',
'♦': 'diamonds',
c: 'clubs',
club: 'clubs',
clubs: 'clubs',
'♣': 'clubs'
};

function normalizeToken(value: string): string {
return value.trim().toLowerCase().replace(/[^a-z0-9♠♥♦♣]/g, '');
}

export function parseCardText(value: string): Card | null {
const compact = value.trim();
if (!compact) return null;

const shorthand = compact.match(/^([AKQJ]|10|[2-9])([shdc♠♥♦♣])$/i);
if (shorthand) {
const rank = RANK_ALIASES[normalizeToken(shorthand[1])];
const suit = SUIT_ALIASES[normalizeToken(shorthand[2])];
if (rank && suit) return { rank, suit };
}

const tokens = compact
.split(/\s+|of/i)
.map((token) => normalizeToken(token))
.filter(Boolean);

let rank: Rank | undefined;
let suit: Suit | undefined;
for (const token of tokens) {
if (!rank && RANK_ALIASES[token]) rank = RANK_ALIASES[token];
if (!suit && SUIT_ALIASES[token]) suit = SUIT_ALIASES[token];
}

if (!rank || !suit) return null;
return { rank, suit };
}

async function detectWithGemini(imageDataUrl: string, apiKey: string): Promise<Card | null> {
if (!apiKey || !imageDataUrl.startsWith('data:image')) return null;

const base64 = imageDataUrl.split(',')[1];
if (!base64) return null;

const response = await fetch(
'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
{
method: 'POST',
headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
body: JSON.stringify({
contents: [
{
parts: [
{
text: 'Identify the single playing card in this image. Reply ONLY with JSON: {"rank":"A|K|Q|J|10|9|8|7|6|5|4|3|2","suit":"spades|hearts|diamonds|clubs"}'
},
{ inline_data: { mime_type: 'image/jpeg', data: base64 } }
]
}
]
})
}
);

if (!response.ok) return null;
const data = await response.json();
const rawText = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join(' ');
if (!rawText) return null;

const jsonMatch = rawText.match(/\{[\s\S]*\}/);
if (jsonMatch) {
try {
const parsed = JSON.parse(jsonMatch[0]);
if (parsed?.rank && parsed?.suit) {
const card = parseCardText(`${parsed.rank} ${parsed.suit}`);
if (card) return card;
}
} catch {
// fall through to free-text parsing
}
}

return parseCardText(rawText);
}

export async function checkGeminiConnection(apiKey: string): Promise<GeminiConnectionCheck> {
if (!apiKey.trim()) {
return { ok: false, message: 'Enter a Gemini API key before continuing.' };
}

try {
const response = await fetch(
'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
{
method: 'POST',
headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
body: JSON.stringify({
contents: [
{
parts: [{ text: 'Reply with the single word OK.' }]
}
]
})
}
);

if (!response.ok) {
return { ok: false, message: 'Gemini connection failed. Check the API key and network access, then try again.' };
}

return { ok: true, message: 'Gemini connection established.' };
} catch {
return { ok: false, message: 'Gemini connection could not be established. Check the API key and network access, then try again.' };
}
}

export async function detectCard(options: {
provider: VisionProvider;
manualInput: string;
imageDataUrl: string;
geminiApiKey: string;
}): Promise<Card | null> {
if (options.provider === 'gemini') {
const geminiCard = await detectWithGemini(options.imageDataUrl, options.geminiApiKey);
if (geminiCard) return geminiCard;
}

return parseCardText(options.manualInput);
}
