<svelte:options runes={false} />

<script lang="ts">
    import { onDestroy } from "svelte";
    import type { Card, CardState, CardTarget } from "$lib/game";
    import {
        addCardToState,
        cardToLabel,
        getAiTurnPlan,
        getGameStage,
    } from "$lib/game";
    import {
        checkGeminiConnection,
        detectCard,
        type VisionProvider,
    } from "$lib/vision";

    const WIZARD_STEPS = [
        {
            id: "setup",
            title: "Setup",
            subtitle: "Choose table size and capture mode",
        },
        {
            id: "deal",
            title: "Deal",
            subtitle: "Assign hole cards and community cards",
        },
        {
            id: "loop",
            title: "Game loop",
            subtitle: "Update bets and read the AI action",
        },
        { id: "end", title: "End", subtitle: "Close the hand and start again" },
    ] as const;

    type WizardStep = (typeof WIZARD_STEPS)[number]["id"];

    function createEmptyState(): CardState {
        return {
            playerCards: [],
            aiCards: [],
            communityCards: [],
        };
    }

    function pluralize(
        count: number,
        singular: string,
        plural: string = `${singular}s`,
    ) {
        return `${count} ${count === 1 ? singular : plural}`;
    }

    let wizardStep: WizardStep = "setup";
    let humanPlayers = 1;
    let aiPlayers = 1;
    let handNumber = 1;
    let provider: VisionProvider = "mock";
    let geminiApiKey = "";
    let manualCardInput = "";
    let selectedTarget: CardTarget = "player";
    let status =
        "Step 1: choose the table size, then continue to the deal step.";

    let gameState: CardState = createEmptyState();
    let showPlayerCards = false;
    let showAiCards = false;
    let pot = 0;
    let toCall = 0;

    let dealPhase: "wait" | "capturing" = "wait";
    let communityStage: "preflop" | "flop" | "turn" | "river" = "preflop";

    let videoElement: HTMLVideoElement | undefined;
    let canvasElement: HTMLCanvasElement | undefined;
    let imageDataUrl = "";
    let stream: MediaStream | null = null;
    let cameraError = "";
    let geminiCheckInProgress = false;

    let currentStepIndex = 0;
    let currentStepTitle: string = WIZARD_STEPS[0].title;
    let stage = getGameStage(gameState.communityCards);
    let aiPlan = getAiTurnPlan({
        aiCards: gameState.aiCards,
        communityCards: gameState.communityCards,
        toCall,
        pot,
    });

    function tableSummary() {
        return `${pluralize(humanPlayers, "human player")} and ${pluralize(aiPlayers, "AI player")}`;
    }

    function resetTableState() {
        gameState = createEmptyState();
        showPlayerCards = false;
        showAiCards = false;
        pot = 0;
        toCall = 0;
        manualCardInput = "";
        selectedTarget = "player";
        imageDataUrl = "";
        cameraError = "";
        dealPhase = "wait";
        communityStage = "preflop";
    }

    function stepMessage(step: WizardStep) {
        if (step === "setup")
            return "Configure the table, choose a vision provider, and decide how many human and AI seats are in the hand.";
        if (step === "deal")
            return `Deal hole cards for ${tableSummary()}, then capture each card and assign it to the correct pile.`;
        if (step === "loop")
            return "Update the betting state, read the AI plan, and keep capturing community cards through the flop, turn, and river.";
        return "Record the showdown result, clear the table, and either restart the wizard or begin the next hand.";
    }

    function stageActionInstruction(currentStage: typeof stage) {
        if (currentStage === "preflop")
            return "Capture the flop (3 community cards).";
        if (currentStage === "flop")
            return "Capture the turn (1 community card).";
        if (currentStage === "turn")
            return "Capture the river (final community card).";
        return "All community cards are dealt. Move to the end step when ready.";
    }

    function getDetailedInstruction(): string {
        if (wizardStep === "setup") {
            return "Choose the number of players at the table and select a card detection method.";
        }

        if (wizardStep === "deal") {
            const totalCardsNeeded = (humanPlayers + aiPlayers) * 2;
            const cardsDealt =
                gameState.playerCards.length + gameState.aiCards.length;
            if (dealPhase === "wait") {
                return `Ready to capture cards. You will need ${totalCardsNeeded} hole cards total (2 per seat). Click "Start capturing" when you are ready to begin.`;
            }
            return `Capture card ${cardsDealt + 1} of ${totalCardsNeeded}. Assign it to the correct seat (Player or AI hole cards).`;
        }

        if (wizardStep === "loop") {
            return `Pot setting stage: enter the current pot and the AI call amount. Action stage: read the AI plan. Board stage: ${stageActionInstruction(stage)}`;
        }

        return 'Review the hand result. Click "Start next hand" to continue with the same table setup, or "Restart setup" to change the player counts.';
    }

    function setStatusForStep(step: WizardStep) {
        status = `Step ${WIZARD_STEPS.findIndex((candidate) => candidate.id === step) + 1}: ${stepMessage(step)}`;
    }

    function goToStep(step: WizardStep) {
        if (step !== "setup" && (humanPlayers < 1 || aiPlayers < 1)) {
            status =
                "Choose at least one human player and one AI player before moving into the hand.";
            return;
        }

        wizardStep = step;
        setStatusForStep(step);
    }

    function restartWizard() {
        stopCamera();
        wizardStep = "setup";
        handNumber = 1;
        resetTableState();
        setStatusForStep("setup");
    }

    function startNextHand() {
        wizardStep = "deal";
        handNumber += 1;
        resetTableState();
        setStatusForStep("deal");
    }

    function goBack() {
        if (wizardStep === "deal") {
            goToStep("setup");
            return;
        }

        if (wizardStep === "loop") {
            goToStep("deal");
            return;
        }

        if (wizardStep === "end") {
            goToStep("loop");
        }
    }

    function advanceStep() {
        if (wizardStep === "setup") {
            if (provider !== "gemini") {
                goToStep("deal");
                return;
            }

            if (geminiCheckInProgress) {
                return;
            }

            geminiCheckInProgress = true;
            checkGeminiConnection(geminiApiKey)
                .then((result) => {
                    if (!result.ok) {
                        status = result.message;
                        return;
                    }

                    setStatusForStep("deal");
                    wizardStep = "deal";
                })
                .finally(() => {
                    geminiCheckInProgress = false;
                });
            return;
        }

        if (wizardStep === "deal") {
            goToStep("loop");
            return;
        }

        if (wizardStep === "loop") {
            goToStep("end");
            return;
        }

        startNextHand();
    }

    async function startCamera() {
        cameraError = "";
        if (!navigator?.mediaDevices?.getUserMedia) {
            cameraError = "Camera API is unavailable in this browser.";
            return;
        }

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" },
                audio: false,
            });
            if (videoElement) videoElement.srcObject = stream;
        } catch {
            cameraError =
                "Unable to access camera. Check permissions and try again.";
        }
    }

    function stopCamera() {
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;

        if (videoElement) videoElement.srcObject = null;
    }

    function captureFrame() {
        if (!videoElement || !canvasElement) return;

        const ctx = canvasElement.getContext("2d");
        if (!ctx) return;

        canvasElement.width = videoElement.videoWidth || 640;
        canvasElement.height = videoElement.videoHeight || 360;
        ctx.drawImage(
            videoElement,
            0,
            0,
            canvasElement.width,
            canvasElement.height,
        );
        imageDataUrl = canvasElement.toDataURL("image/jpeg", 0.9);
        status = `Step ${WIZARD_STEPS.findIndex((candidate) => candidate.id === wizardStep) + 1}: frame captured. Detect the card and assign it to a pile.`;
    }

    async function detectAndAssignCard() {
        const card = await detectCard({
            provider,
            manualInput: manualCardInput,
            imageDataUrl,
            geminiApiKey,
        });

        if (!card) {
            status =
                'Card detection failed. Use a clearer frame or type value like "Ah" or "Ace of Hearts".';
            return;
        }

        const update = addCardToState(gameState, selectedTarget, card);
        if (!update.ok) {
            status = update.error;
            return;
        }

        gameState = update.state;
        manualCardInput = "";
        status = `${cardToLabel(card)} was assigned to ${selectedTarget}.`;
    }

    function visibleLabel(card: Card, reveal: boolean) {
        return reveal ? cardToLabel(card) : "Hidden card";
    }

    $: currentStepIndex = WIZARD_STEPS.findIndex(
        (step) => step.id === wizardStep,
    );
    $: currentStepTitle =
        WIZARD_STEPS[currentStepIndex]?.title ?? WIZARD_STEPS[0].title;
    $: stage = getGameStage(gameState.communityCards);
    $: aiPlan = getAiTurnPlan({
        aiCards: gameState.aiCards,
        communityCards: gameState.communityCards,
        toCall,
        pot,
    });

    onDestroy(() => stopCamera());
</script>

<svelte:head>
    <title>Single Player Texas Hold'em Wizard</title>
    <meta
        name="description"
        content="Follow a step-by-step Texas Hold'em wizard from table setup to deal, game loop, and hand end."
    />
</svelte:head>

<main class="shell">
    <header class="hero">
        <div>
            <p class="eyebrow">Interactive table wizard</p>
            <h1>Single Player Texas Hold&apos;em Wizard</h1>
            <p class="lede">
                Set the number of human and AI players, deal the hand, read the
                betting loop, and close out the table in order.
            </p>
        </div>
        <aside class="hero-card">
            <span>Hand {handNumber}</span>
            <strong>{tableSummary()}</strong>
            <p>Current stage: {stage}</p>
        </aside>
    </header>

    <nav class="stepper" aria-label="Wizard steps">
        {#each WIZARD_STEPS as step, index}
            <button
                type="button"
                class:active={wizardStep === step.id}
                class:done={index < currentStepIndex}
                on:click={() => goToStep(step.id)}
            >
                <span>{index + 1}</span>
                <div>
                    <strong>{step.title}</strong>
                    <small>{step.subtitle}</small>
                </div>
            </button>
        {/each}
    </nav>

    <section class="panel">
        <div class="panel-head">
            <div>
                <p class="step-label">
                    Step {currentStepIndex + 1} of {WIZARD_STEPS.length}
                </p>
                <h2>{currentStepTitle}</h2>
            </div>
            <div class="wizard-actions">
                <button
                    type="button"
                    on:click={goBack}
                    disabled={wizardStep === "setup"}>Back</button
                >
                <button
                    type="button"
                    on:click={advanceStep}
                    disabled={wizardStep === "setup" &&
                        (humanPlayers < 1 || aiPlayers < 1)}
                >
                    {wizardStep === "end" ? "Start next hand" : "Next step"}
                </button>
            </div>
        </div>

        <p class="callout">{getDetailedInstruction()}</p>

        {#if wizardStep === "setup"}
            <article class="card">
                <h3>What to do next</h3>
                <ol>
                    <li>
                        Choose the number of human and AI players at the table.
                    </li>
                    <li>Pick a card detection mode for the hand.</li>
                    <li>
                        Move to the deal step when you are ready to start
                        capturing cards.
                    </li>
                </ol>
            </article>

            <div class="grid two-up">
                <article class="card">
                    <h3>Table setup</h3>
                    <div class="row">
                        <label>
                            Human players
                            <input
                                bind:value={humanPlayers}
                                type="number"
                                min="1"
                                step="1"
                            />
                        </label>
                        <label>
                            AI players
                            <input
                                bind:value={aiPlayers}
                                type="number"
                                min="1"
                                step="1"
                            />
                        </label>
                    </div>
                    <p class="note">Configured table: {tableSummary()}.</p>
                </article>

                <article class="card">
                    <h3>Vision provider</h3>
                    <div class="row">
                        <label>
                            Vision provider
                            <select bind:value={provider}>
                                <option value="mock"
                                    >Mock/manual (offline)</option
                                >
                                <option value="gemini">Gemini vision API</option
                                >
                            </select>
                        </label>
                        {#if provider === "gemini"}
                            <label>
                                Gemini API key (used only in your browser)
                                <input
                                    bind:value={geminiApiKey}
                                    type="password"
                                    placeholder="AIza..."
                                />
                            </label>
                        {/if}
                    </div>
                </article>
            </div>
        {:else if wizardStep === "deal"}
            <div class="grid two-up">
                <article class="card">
                    <h3>Card capture</h3>
                    {#if dealPhase === "wait"}
                        <p class="note">
                            You will need to capture <strong
                                >{(humanPlayers + aiPlayers) * 2} hole cards</strong
                            >—2 for each seat at the table.
                        </p>
                        <button
                            type="button"
                            on:click={() => (dealPhase = "capturing")}
                            class="primary-button"
                        >
                            Start capturing
                        </button>
                    {:else}
                        <div class="progress-bar">
                            <div
                                class="progress-fill"
                                style="width: {((gameState.playerCards.length +
                                    gameState.aiCards.length) /
                                    ((humanPlayers + aiPlayers) * 2)) *
                                    100}%"
                            ></div>
                            <span class="progress-label"
                                >{gameState.playerCards.length +
                                    gameState.aiCards.length} / {(humanPlayers +
                                    aiPlayers) *
                                    2} cards captured</span
                            >
                        </div>

                        <div class="row">
                            <label>
                                Card value (or capture with camera)
                                <input
                                    bind:value={manualCardInput}
                                    placeholder="Ah / 10d / Ace of Hearts"
                                />
                            </label>
                            <label>
                                Seat
                                <select bind:value={selectedTarget}>
                                    <option value="player"
                                        >Player hole cards</option
                                    >
                                    <option value="ai">AI hole cards</option>
                                </select>
                            </label>
                        </div>

                        <div class="row camera-actions">
                            <button type="button" on:click={startCamera}
                                >Start camera</button
                            >
                            <button type="button" on:click={captureFrame}
                                >Capture frame</button
                            >
                            <button type="button" on:click={stopCamera}
                                >Stop camera</button
                            >
                            <button type="button" on:click={detectAndAssignCard}
                                >Detect + assign</button
                            >
                        </div>

                        {#if cameraError}
                            <p class="error">{cameraError}</p>
                        {/if}

                        <div class="camera-grid">
                            <video
                                bind:this={videoElement}
                                autoplay
                                playsinline
                                muted
                            ></video>
                            <canvas bind:this={canvasElement}></canvas>
                        </div>
                        {#if imageDataUrl}
                            <img
                                src={imageDataUrl}
                                alt="Captured card frame"
                                class="snapshot"
                            />
                        {/if}
                    {/if}
                </article>

                <article class="card">
                    <h3>Hole cards</h3>
                    <div class="row toggles">
                        <label
                            ><input
                                type="checkbox"
                                bind:checked={showPlayerCards}
                            /> Show player cards</label
                        >
                        <label
                            ><input
                                type="checkbox"
                                bind:checked={showAiCards}
                            /> Show AI cards</label
                        >
                    </div>
                    <div class="pile-grid">
                        <article class="subcard">
                            <h4>Player ({gameState.playerCards.length}/2)</h4>
                            <ol>
                                {#each gameState.playerCards as card}
                                    <li>
                                        {visibleLabel(card, showPlayerCards)}
                                    </li>
                                {/each}
                            </ol>
                        </article>
                        <article class="subcard">
                            <h4>AI ({gameState.aiCards.length}/2)</h4>
                            <ol>
                                {#each gameState.aiCards as card}
                                    <li>{visibleLabel(card, showAiCards)}</li>
                                {/each}
                            </ol>
                        </article>
                    </div>
                </article>
            </div>

            {#if dealPhase === "capturing" && gameState.playerCards.length === 2 && gameState.aiCards.length === 2 && humanPlayers + aiPlayers === 2}
                <article class="card highlight">
                    <p class="note">
                        ✓ All hole cards captured. Move to the game loop step to
                        begin the betting rounds.
                    </p>
                </article>
            {/if}
        {:else if wizardStep === "loop"}
            <div class="grid two-up">
                <article class="card">
                    <h3>Initial betting state</h3>
                    <p class="instruction-text">
                        Stage 1: update the current pot and the AI call amount.
                    </p>
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
                </article>

                <article class="card">
                    <h3>Action stage</h3>
                    <p class="instruction-text">
                        Stage 2: read the AI plan and apply the action.
                    </p>
                    <article class="subcard highlight">
                        <h4>AI action: {aiPlan.action.toUpperCase()}</h4>
                        <p class="instruction-text">{aiPlan.reason}</p>
                        <ul>
                            {#each aiPlan.physicalInstructions as instruction}
                                <li>{instruction}</li>
                            {/each}
                        </ul>
                        {#if aiPlan.amount !== undefined}
                            <p><strong>Amount: {aiPlan.amount}</strong></p>
                        {/if}
                    </article>
                </article>

                <article class="card">
                    <h3>Board stage</h3>
                    <p class="instruction-text">
                        Stage 3: {stageActionInstruction(stage)}
                    </p>
                    <p class="instruction-text">
                        Current street: <strong>{stage.toUpperCase()}</strong>
                    </p>
                    <p class="instruction-text">
                        Capture the community cards for this betting round:
                    </p>

                    <div class="row">
                        <label>
                            Card value
                            <input
                                bind:value={manualCardInput}
                                placeholder="Ah / 10d / Ace of Hearts"
                            />
                        </label>
                    </div>

                    <div class="row camera-actions">
                        <button type="button" on:click={startCamera}
                            >Start camera</button
                        >
                        <button type="button" on:click={captureFrame}
                            >Capture frame</button
                        >
                        <button type="button" on:click={stopCamera}
                            >Stop camera</button
                        >
                        <button
                            type="button"
                            on:click={() => {
                                selectedTarget = "community";
                                detectAndAssignCard();
                            }}>Detect + add to board</button
                        >
                    </div>

                    {#if cameraError}
                        <p class="error">{cameraError}</p>
                    {/if}

                    <div class="camera-grid">
                        <video
                            bind:this={videoElement}
                            autoplay
                            playsinline
                            muted
                        ></video>
                        <canvas bind:this={canvasElement}></canvas>
                    </div>
                    {#if imageDataUrl}
                        <img
                            src={imageDataUrl}
                            alt="Captured card frame"
                            class="snapshot"
                        />
                    {/if}

                    <div class="pile-grid">
                        <article class="subcard">
                            <h4>
                                Community ({gameState.communityCards.length}/5)
                            </h4>
                            <ol>
                                {#each gameState.communityCards as card}
                                    <li>{cardToLabel(card)}</li>
                                {/each}
                            </ol>
                        </article>
                    </div>
                </article>
            </div>
        {:else}
            <article class="card highlight">
                <h3>Hand complete</h3>
                <p class="instruction-text">
                    Review the final hand and choose your next action:
                </p>

                <div class="pile-grid">
                    <article class="subcard">
                        <h4>Player hole cards</h4>
                        <ol>
                            {#each gameState.playerCards as card}
                                <li>{cardToLabel(card)}</li>
                            {/each}
                        </ol>
                    </article>
                    <article class="subcard">
                        <h4>AI hole cards</h4>
                        <ol>
                            {#each gameState.aiCards as card}
                                <li>{cardToLabel(card)}</li>
                            {/each}
                        </ol>
                    </article>
                    <article class="subcard">
                        <h4>Community cards</h4>
                        <ol>
                            {#each gameState.communityCards as card}
                                <li>{cardToLabel(card)}</li>
                            {/each}
                        </ol>
                    </article>
                </div>
            </article>

            <article class="card">
                <h3>What's next?</h3>
                <p class="instruction-text">
                    Record the result if needed, then proceed:
                </p>
                <div class="wizard-actions stacked">
                    <button
                        type="button"
                        on:click={startNextHand}
                        class="primary-button"
                        >Start next hand (keep table setup)</button
                    >
                    <button type="button" on:click={restartWizard}
                        >Return to setup (change players/provider)</button
                    >
                </div>
            </article>
        {/if}
    </section>

    <p class="status">{status}</p>
</main>

<style>
    :global(body) {
        margin: 0;
        font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
        background: radial-gradient(
                circle at top left,
                rgba(57, 119, 255, 0.2),
                transparent 34%
            ),
            radial-gradient(
                circle at top right,
                rgba(13, 176, 118, 0.18),
                transparent 26%
            ),
            #09101d;
        color: #f0f4ff;
    }

    main.shell {
        max-width: 1120px;
        margin: 0 auto;
        padding: 1.25rem;
    }

    .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.6fr) minmax(260px, 0.8fr);
        gap: 1rem;
        align-items: start;
        margin-bottom: 1rem;
    }

    .eyebrow {
        margin: 0 0 0.35rem;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-size: 0.74rem;
        color: #8fb0ff;
    }

    h1,
    h2,
    h3,
    h4,
    p {
        margin-top: 0;
    }

    .lede {
        max-width: 62ch;
        color: #cdd8f7;
    }

    .hero-card,
    .panel,
    .card,
    .subcard {
        border: 1px solid rgba(117, 145, 206, 0.28);
        background: rgba(8, 15, 29, 0.82);
        backdrop-filter: blur(12px);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.22);
    }

    .hero-card {
        padding: 1rem;
        border-radius: 1rem;
        display: grid;
        gap: 0.25rem;
    }

    .hero-card span,
    .step-label {
        font-size: 0.8rem;
        color: #96aee2;
        text-transform: uppercase;
        letter-spacing: 0.1em;
    }

    .hero-card strong {
        font-size: 1.1rem;
    }

    .stepper {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0.75rem;
        margin-bottom: 1rem;
    }

    .stepper button {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.75rem;
        align-items: center;
        text-align: left;
        padding: 0.9rem;
        border-radius: 0.95rem;
        border: 1px solid rgba(117, 145, 206, 0.28);
        background: rgba(10, 18, 34, 0.75);
        color: inherit;
        cursor: pointer;
    }

    .stepper button span {
        display: grid;
        place-items: center;
        width: 2rem;
        height: 2rem;
        border-radius: 999px;
        background: rgba(92, 131, 255, 0.18);
        font-weight: 700;
    }

    .stepper button strong,
    .stepper button small {
        display: block;
    }

    .stepper button small {
        color: #9cb0d6;
    }

    .stepper button.active {
        border-color: rgba(98, 160, 255, 0.85);
        box-shadow: 0 0 0 1px rgba(98, 160, 255, 0.2);
    }

    .stepper button.done {
        background: rgba(16, 28, 49, 0.9);
    }

    .panel {
        padding: 1rem;
        border-radius: 1rem;
    }

    .panel-head {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: start;
        margin-bottom: 0.75rem;
    }

    .wizard-actions {
        display: flex;
        gap: 0.65rem;
        flex-wrap: wrap;
    }

    .wizard-actions.stacked {
        flex-direction: column;
        align-items: stretch;
    }

    .wizard-actions button,
    input,
    select {
        padding: 0.6rem 0.8rem;
        border-radius: 0.55rem;
        border: 1px solid rgba(117, 145, 206, 0.35);
        background: rgba(5, 11, 22, 0.9);
        color: inherit;
    }

    .wizard-actions button {
        cursor: pointer;
    }

    .wizard-actions button:disabled,
    .stepper button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .callout,
    .note,
    .status {
        background: rgba(26, 40, 71, 0.74);
        border-radius: 0.85rem;
        padding: 0.8rem 0.9rem;
    }

    .callout {
        margin-bottom: 1rem;
    }

    .grid {
        display: grid;
        gap: 0.9rem;
    }

    .grid.two-up {
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        margin-bottom: 0.9rem;
    }

    .card,
    .subcard {
        padding: 0.95rem;
        border-radius: 0.9rem;
    }

    .subcard {
        background: rgba(5, 11, 22, 0.76);
    }

    .row {
        display: grid;
        gap: 0.75rem;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        margin-bottom: 0.75rem;
    }

    label {
        display: grid;
        gap: 0.25rem;
    }

    .camera-actions {
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
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
        border: 1px solid rgba(117, 145, 206, 0.35);
        border-radius: 0.7rem;
        background: #02060f;
    }

    .pile-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 0.75rem;
    }

    ol,
    ul {
        margin: 0;
        padding-left: 1.2rem;
    }

    .error {
        color: #ff9a9a;
    }

    .highlight {
        background: linear-gradient(
            180deg,
            rgba(21, 35, 67, 0.9),
            rgba(7, 12, 22, 0.88)
        );
    }

    .status {
        margin-top: 1rem;
    }

    .primary-button {
        background: linear-gradient(
            135deg,
            rgba(98, 160, 255, 0.9),
            rgba(57, 119, 255, 0.9)
        );
        border-color: rgba(98, 160, 255, 0.85);
        font-weight: 600;
    }

    .primary-button:hover {
        background: linear-gradient(
            135deg,
            rgba(98, 160, 255, 1),
            rgba(57, 119, 255, 1)
        );
    }

    .progress-bar {
        position: relative;
        width: 100%;
        height: 2.2rem;
        background: rgba(10, 18, 34, 0.6);
        border: 1px solid rgba(117, 145, 206, 0.35);
        border-radius: 0.5rem;
        overflow: hidden;
        margin-bottom: 0.75rem;
    }

    .progress-fill {
        height: 100%;
        background: linear-gradient(
            90deg,
            rgba(57, 119, 255, 0.6),
            rgba(98, 160, 255, 0.8)
        );
        transition: width 0.3s ease;
    }

    .progress-label {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-weight: 600;
        color: #f0f4ff;
        font-size: 0.9rem;
    }

    .instruction-text {
        color: #cdd8f7;
        font-size: 0.95rem;
        margin-bottom: 0.75rem;
    }

    @media (max-width: 800px) {
        .hero {
            grid-template-columns: 1fr;
        }

        .stepper {
            grid-template-columns: 1fr;
        }

        .panel-head {
            flex-direction: column;
        }
    }
</style>
