# Single Player Texas (Interactive Wizard)

Use this step-by-step wizard flow to guide a player from setup to game end.

## Step 1: Start the game
- Show: **Welcome to Single Player Texas**
- Ask: "Press Enter to begin setup"

## Step 2: Configure players
1. Ask for number of **human players** (minimum 1).
2. Ask for number of **AI players** (minimum 1).
3. Validate total seats against your table limit.
4. Show summary:
   - Humans: `<human_count>`
   - AI: `<ai_count>`
   - Total: `<total_players>`
5. Ask: "Confirm setup? (yes/no)"

## Step 3: Configure game options
- Ask for starting chips per player.
- Ask for small blind / big blind.
- Ask for difficulty level for AI (easy/medium/hard).
- Show configuration summary and ask for final confirmation.

## Step 4: Begin game loop
For each hand:
1. Announce hand number.
2. Deal cards.
3. Run betting rounds in order:
   - Pre-flop
   - Flop
   - Turn
   - River
4. On each player turn:
   - Show current pot, player chips, and available actions.
   - Ask human player action (fold/check/call/raise).
   - Resolve AI action automatically.
5. Resolve showdown (or early win if all others fold).
6. Award pot and update chip counts.
7. Ask: "Play next hand? (yes/no)"

## Step 5: End conditions
End when either condition is met:
- User chooses to stop after a hand.
- Only one player has chips remaining.

At end:
1. Show final standings.
2. Announce winner.
3. Ask: "Start a new game with wizard setup? (yes/no)"

## Suggested prompt style
Keep each step explicit and interactive:
- Explain what is happening now.
- Show exactly what input is expected.
- Confirm important decisions before continuing.
