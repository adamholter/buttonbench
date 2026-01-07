# ButtonBench Feature Ideas

## Session History & Resume (Play Mode)
- **Rationale:** Let players resume unfinished games and review completed runs without losing their prompt history.
- **Outline:** Add a `/api/play/history` endpoint to fetch recent games by user ID, then add a “Your Sessions” panel in `/play` with Resume/Review actions that rehydrate messages and game state.

## Leaderboard Enhancements (Streaks & Averages)
- **Rationale:** The backend already computes streaks and average win/defeat turns; exposing them makes the leaderboard more informative.
- **Outline:** Extend the Play leaderboard tables to show best streak and average turns to win/defeat, plus a “Hardest” badge for the most resilient model.

## Export Winning Prompts (JSON/CSV)
- **Rationale:** Researchers can quickly download winning prompts for offline analysis without manual copying.
- **Outline:** Add a `/api/play/prompts` export endpoint that returns JSON/CSV, and add Download buttons in the “Winning Prompts” tab.

## Upload Benchmark Results (Visualizer)
- **Rationale:** Makes the visualizer usable on hosted deployments where the filesystem isn’t available.
- **Outline:** Add a file upload on the results page to parse and render a benchmark JSON file locally in the browser when no local results are available.
