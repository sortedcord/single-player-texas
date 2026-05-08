<svelte:options runes={false} />

<script lang="ts">
import { onDestroy } from 'svelte';
import type { Card, CardState, CardTarget } from '$lib/game';
import { addCardToState, cardToLabel, getAiTurnPlan, getGameStage } from '$lib/game';
import { detectCard, type VisionProvider } from '$lib/vision';

let provider: VisionProvider = 'mock';
let geminiApiKey = '';
let manualCardInput = '';
let selectedTarget: CardTarget = 'player';
let status = 'Show each dealt card to the camera (or enter manually) and assign it to a pile.';

let gameState: CardState = {
playerCards: [],
aiCards: [],
communityCards: []
};

let showPlayerCards = false;
let showAiCards = false;
let pot = 0;
let toCall = 0;

let videoElement: HTMLVideoElement | undefined;
let canvasElement: HTMLCanvasElement | undefined;
let imageDataUrl = '';
let stream: MediaStream | null = null;
let cameraError = '';

async function startCamera() {
cameraError = '';
if (!navigator?.mediaDevices?.getUserMedia) {
cameraError = 'Camera API is unavailable in this browser.';
return;
}
try {
stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
if (videoElement) videoElement.srcObject = stream;
} catch {
cameraError = 'Unable to access camera. Check permissions and try again.';
}
}

function stopCamera() {
stream?.getTracks().forEach((track) => track.stop());
stream = null;
if (videoElement) videoElement.srcObject = null;
}

function captureFrame() {
if (!videoElement || !canvasElement) return;
const ctx = canvasElement.getContext('2d');
if (!ctx) return;
canvasElement.width = videoElement.videoWidth || 640;
canvasElement.height = videoElement.videoHeight || 360;
ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
imageDataUrl = canvasElement.toDataURL('image/jpeg', 0.9);
status = 'Frame captured. Detect card and add it to the selected pile.';
}

async function detectAndAssignCard() {
const card = await detectCard({
provider,
manualInput: manualCardInput,
imageDataUrl,
geminiApiKey
});

if (!card) {
status = 'Card detection failed. Use a clearer frame or type value like "Ah" or "Ace of Hearts".';
return;
}

const update = addCardToState(gameState, selectedTarget, card);
if (!update.ok) {
status = update.error;
return;
}

gameState = update.state;
manualCardInput = '';
status = `${cardToLabel(card)} was assigned to ${selectedTarget}.`;
}

function resetHand() {
gameState = { playerCards: [], aiCards: [], communityCards: [] };
pot = 0;
toCall = 0;
status = 'New hand started. Capture each card as it is dealt.';
}

function visibleLabel(card: Card, reveal: boolean) {
return reveal ? cardToLabel(card) : 'Hidden card';
}

$: stage = getGameStage(gameState.communityCards);
$: aiPlan = getAiTurnPlan({
aiCards: gameState.aiCards,
communityCards: gameState.communityCards,
toCall,
pot
});

onDestroy(() => stopCamera());
</script>

<svelte:head>
<title>Single Player Texas Hold'em Assistant</title>
<meta
name="description"
content="Play physical-card Texas Hold'em with camera capture and optional Gemini vision card detection."
/>
</svelte:head>

<main>
<h1>Single Player Texas Hold'em Assistant</h1>
<p>
Capture each physical card with your camera (or manually enter it), assign it to a private pile, and follow
the AI action instructions.
</p>

<section>
<h2>1) Card capture and vision provider</h2>
<div class="row">
<label>
Vision provider
<select bind:value={provider}>
<option value="mock">Mock/manual (offline)</option>
<option value="gemini">Gemini vision API</option>
</select>
</label>
{#if provider === 'gemini'}
<label>
Gemini API key (used only in your browser)
<input bind:value={geminiApiKey} type="password" placeholder="AIza..." />
</label>
{/if}
</div>

<div class="row camera-actions">
<button type="button" on:click={startCamera}>Start camera</button>
<button type="button" on:click={captureFrame}>Capture frame</button>
<button type="button" on:click={stopCamera}>Stop camera</button>
</div>

{#if cameraError}
<p class="error">{cameraError}</p>
{/if}

<div class="camera-grid">
<video bind:this={videoElement} autoplay playsinline muted></video>
<canvas bind:this={canvasElement}></canvas>
</div>
{#if imageDataUrl}
<img src={imageDataUrl} alt="Captured card frame" class="snapshot" />
{/if}

<div class="row">
<label>
Detected card (manual fallback)
<input bind:value={manualCardInput} placeholder="Ah / 10d / Ace of Hearts" />
</label>
<label>
Assign to
<select bind:value={selectedTarget}>
<option value="player">Player hidden cards</option>
<option value="ai">AI hidden cards (separate context)</option>
<option value="community">Community board</option>
</select>
</label>
</div>

<div class="row camera-actions">
<button type="button" on:click={detectAndAssignCard}>Detect + assign card</button>
<button type="button" on:click={resetHand}>Reset hand</button>
</div>
</section>

<section>
<h2>2) Private contexts and board state</h2>
<p>
Player and AI hole cards are tracked in separate contexts to avoid information bleed. Toggle visibility when
you want to verify entries.
</p>
<div class="row toggles">
<label><input type="checkbox" bind:checked={showPlayerCards} /> Reveal player hole cards</label>
<label><input type="checkbox" bind:checked={showAiCards} /> Reveal AI hole cards</label>
</div>
<div class="pile-grid">
<article>
<h3>Player hole cards</h3>
<ol>
{#each gameState.playerCards as card}
<li>{visibleLabel(card, showPlayerCards)}</li>
{/each}
</ol>
</article>
<article>
<h3>AI hole cards</h3>
<ol>
{#each gameState.aiCards as card}
<li>{visibleLabel(card, showAiCards)}</li>
{/each}
</ol>
</article>
<article>
<h3>Community cards</h3>
<ol>
{#each gameState.communityCards as card}
<li>{cardToLabel(card)}</li>
{/each}
</ol>
</article>
</div>
</section>

<section>
<h2>3) AI action helper (physical game instructions)</h2>
<div class="row">
<label>
Current pot
<input type="number" min="0" bind:value={pot} />
</label>
<label>
Amount for AI to call
<input type="number" min="0" bind:value={toCall} />
</label>
</div>
<p>Stage: <strong>{stage}</strong></p>
<p>
Suggested action: <strong>{aiPlan.action}</strong>
{#if aiPlan.amount !== undefined} ({aiPlan.amount}){/if}
</p>
<p>Reason: {aiPlan.reason}</p>
<ul>
{#each aiPlan.physicalInstructions as instruction}
<li>{instruction}</li>
{/each}
</ul>
</section>

<p class="status">{status}</p>
</main>

<style>
:global(body) {
margin: 0;
font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
background: #0c1322;
color: #f0f4ff;
}

main {
max-width: 980px;
margin: 0 auto;
padding: 1.25rem;
}

h1,
h2,
h3 {
margin-bottom: 0.5rem;
}

section {
margin: 1rem 0;
padding: 1rem;
border: 1px solid #2a3754;
border-radius: 0.75rem;
background: #111a2d;
}

.row {
display: grid;
gap: 0.75rem;
grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
margin-bottom: 0.75rem;
}

label {
display: grid;
gap: 0.25rem;
}

input,
select,
button {
padding: 0.55rem;
border-radius: 0.4rem;
border: 1px solid #3d4f74;
background: #0f1a33;
color: #f0f4ff;
}

button {
cursor: pointer;
}

.camera-actions {
grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.camera-grid {
display: grid;
grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
gap: 0.75rem;
}

video,
canvas,
.snapshot {
width: 100%;
max-height: 260px;
border: 1px solid #3d4f74;
border-radius: 0.5rem;
background: #02060f;
}

.pile-grid {
display: grid;
grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
gap: 0.75rem;
}

.error {
color: #ff8f8f;
}

.status {
padding: 0.75rem;
background: #172545;
border-radius: 0.5rem;
}
</style>
