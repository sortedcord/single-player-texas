<svelte:options runes={false} />

<script lang="ts">
import { onDestroy } from 'svelte';
import type { Card, CardState, CardTarget } from '$lib/game';
import { addCardToState, cardToLabel, getAiTurnPlan, getGameStage } from '$lib/game';
import { detectCard, type VisionProvider } from '$lib/vision';

type WizardStep = 0 | 1 | 2 | 3 | 4;

let provider: VisionProvider = 'mock';
let geminiApiKey = '';
let manualCardInput = '';
let selectedTarget: CardTarget = 'player';
let status = 'Use the wizard below and complete each step in order.';
let currentStep: WizardStep = 0;

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

function stepTitle(step: WizardStep): string {
switch (step) {
case 0:
return 'Choose vision setup and camera framing';
case 1:
return 'Capture your two hidden player cards';
case 2:
return 'Capture the AI two hidden cards';
case 3:
return 'Capture all five community cards';
default:
return 'Get AI action instructions for betting';
}
}

function stepInstruction(step: WizardStep): string {
switch (step) {
case 0:
return 'Select a vision provider, start the camera, and capture a clear frame of the table area.';
case 1:
return 'Show each of your two hole cards to the camera one at a time, then click Detect + assign card.';
case 2:
return 'Without revealing to the player, show each AI hole card and assign it to the AI context.';
case 3:
return 'As the hand progresses, capture flop, turn, and river until five community cards are recorded.';
default:
return 'Enter pot and call amount, then follow the AI physical action instructions.';
}
}

function stepTarget(step: WizardStep): CardTarget | null {
if (step === 1) return 'player';
if (step === 2) return 'ai';
if (step === 3) return 'community';
return null;
}

function stepGoal(step: WizardStep): string {
if (step === 1) return `Add 2 player cards (${gameState.playerCards.length}/2 added).`;
if (step === 2) return `Add 2 AI cards (${gameState.aiCards.length}/2 added).`;
if (step === 3) return `Add 5 community cards (${gameState.communityCards.length}/5 added).`;
return 'Step complete.';
}

function canAdvance(step: WizardStep): boolean {
if (step === 0) return true;
if (step === 1) return gameState.playerCards.length === 2;
if (step === 2) return gameState.aiCards.length === 2;
if (step === 3) return gameState.communityCards.length === 5;
return true;
}

function goToStep(step: WizardStep) {
currentStep = step;
const forcedTarget = stepTarget(step);
if (forcedTarget) selectedTarget = forcedTarget;
status = `Step ${step + 1}/5: ${stepInstruction(step)}`;
}

function goToNextStep() {
if (currentStep < 4 && canAdvance(currentStep)) {
goToStep((currentStep + 1) as WizardStep);
}
}

function goToPreviousStep() {
if (currentStep > 0) {
goToStep((currentStep - 1) as WizardStep);
}
}

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
status = 'Frame captured. Detect and assign the card for the current step.';
}

async function detectAndAssignCard() {
const forcedTarget = stepTarget(currentStep);
const target = forcedTarget ?? selectedTarget;
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

const update = addCardToState(gameState, target, card);
if (!update.ok) {
status = update.error;
return;
}

gameState = update.state;
manualCardInput = '';
selectedTarget = target;
status = `${cardToLabel(card)} was assigned to ${target}. ${stepGoal(currentStep)}`;
}

function resetHand() {
gameState = { playerCards: [], aiCards: [], communityCards: [] };
pot = 0;
toCall = 0;
goToStep(0);
status = 'New hand started. Follow the wizard from step 1.';
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
<p>Follow the step-by-step wizard to run a full hand with physical cards.</p>

<section>
<h2>Wizard</h2>
<p><strong>Step {currentStep + 1}/5:</strong> {stepTitle(currentStep)}</p>
<p>{stepInstruction(currentStep)}</p>
<div class="row camera-actions">
<button type="button" on:click={goToPreviousStep} disabled={currentStep === 0}>Previous step</button>
<button type="button" on:click={goToNextStep} disabled={currentStep === 4 || !canAdvance(currentStep)}>
Complete step and continue
</button>
<button type="button" on:click={resetHand}>Reset hand</button>
</div>
{#if currentStep < 4 && !canAdvance(currentStep)}
<p class="hint">Before continuing: {stepGoal(currentStep)}</p>
{/if}
</section>

{#if currentStep === 0}
<section>
<h2>Step 1: Vision setup</h2>
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
</section>
{/if}

{#if currentStep === 0 || currentStep === 1 || currentStep === 2 || currentStep === 3}
<section>
<h2>Camera capture</h2>
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
</section>
{/if}

{#if currentStep === 1 || currentStep === 2 || currentStep === 3}
<section>
<h2>Card assignment for current step</h2>
<p>
Current target pile: <strong>{stepTarget(currentStep)}</strong>
</p>
<div class="row">
<label>
Detected card (manual fallback)
<input bind:value={manualCardInput} placeholder="Ah / 10d / Ace of Hearts" />
</label>
</div>
<div class="row camera-actions">
<button type="button" on:click={detectAndAssignCard}>Detect + assign card</button>
</div>
<p class="hint">{stepGoal(currentStep)}</p>
</section>
{/if}

<section>
<h2>Current hand state</h2>
<div class="row toggles">
<label><input type="checkbox" bind:checked={showPlayerCards} /> Reveal player hole cards</label>
<label><input type="checkbox" bind:checked={showAiCards} /> Reveal AI hole cards</label>
</div>
<div class="pile-grid">
<article>
<h3>Player hole cards ({gameState.playerCards.length}/2)</h3>
<ol>
{#each gameState.playerCards as card}
<li>{visibleLabel(card, showPlayerCards)}</li>
{/each}
</ol>
</article>
<article>
<h3>AI hole cards ({gameState.aiCards.length}/2)</h3>
<ol>
{#each gameState.aiCards as card}
<li>{visibleLabel(card, showAiCards)}</li>
{/each}
</ol>
</article>
<article>
<h3>Community cards ({gameState.communityCards.length}/5)</h3>
<ol>
{#each gameState.communityCards as card}
<li>{cardToLabel(card)}</li>
{/each}
</ol>
</article>
</div>
</section>

{#if currentStep === 4}
<section>
<h2>Step 5: AI action helper</h2>
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
{/if}

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

button:disabled {
opacity: 0.6;
cursor: not-allowed;
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

.hint {
color: #9fc0ff;
}

.status {
padding: 0.75rem;
background: #172545;
border-radius: 0.5rem;
}
</style>
