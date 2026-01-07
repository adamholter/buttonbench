"use client";

import { useState, useEffect, useRef } from "react";

interface Model {
  id: string;
  name: string;
}

interface GameMessage {
  role: "user" | "assistant";
  content: string;
  turnNumber?: number;
}

type GameStatus = "idle" | "playing" | "won" | "lost";

interface LeaderboardPlayer {
  username: string;
  totalWins: number;
  totalGames: number;
  winRate: number;
  fastestWin: number;
  bestStreak: number;
  averageTurnsToWin: number;
  modelsDefeated: string[];
}

interface ModelStats {
  modelId: string;
  modelName: string;
  timesDefeated: number;
  timesResisted: number;
  defeatRate: number;
  fastestDefeat: number;
  averageTurnsToDefeat: number;
  topDefeaters: { username: string; turns: number }[];
  hardestToDefeat: boolean;
}

interface RecentPrompt {
  prompt: string;
  modelName: string;
  username: string;
  turnNumber: number;
  timestamp: string;
}

interface GameHistory {
  id: string;
  modelId: string;
  modelName: string;
  status: "in_progress" | "won" | "lost" | "abandoned";
  startedAt: string;
  endedAt: string | null;
  turnsUsed: number;
  maxTurns: number;
  messages: GameMessage[];
}

const MAX_TURNS = 15;

export default function PlayPage() {
  // Auth state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Game state
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [modelSearch, setModelSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [messages, setMessages] = useState<GameMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [gameStatus, setGameStatus] = useState<GameStatus>("idle");
  const [gameId, setGameId] = useState<string | null>(null);
  const [turnNumber, setTurnNumber] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  // Leaderboard state
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [playerLeaderboard, setPlayerLeaderboard] = useState<LeaderboardPlayer[]>([]);
  const [modelLeaderboard, setModelLeaderboard] = useState<ModelStats[]>([]);
  const [recentPrompts, setRecentPrompts] = useState<RecentPrompt[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<"players" | "models" | "prompts">("players");
  const [historyGames, setHistoryGames] = useState<GameHistory[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load default models on mount
  useEffect(() => {
    fetch("/api/play/models")
      .then((r) => r.json())
      .then((data) => setModels(data.models || []));
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Search models
  const searchModels = async (query: string) => {
    if (!query.trim()) {
      const res = await fetch("/api/play/models");
      const data = await res.json();
      setModels(data.models || []);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`/api/play/models?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setModels(data.models || []);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchModels(modelSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [modelSearch]);

  // Handle login/register
  const handleAuth = async () => {
    if (!username.trim()) {
      setAuthError("Username is required");
      return;
    }

    setIsAuthLoading(true);
    setAuthError(null);

    try {
      const res = await fetch("/api/play/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password: password || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || "Authentication failed");
        return;
      }

      setUserId(data.user.id);
      // Store in localStorage for persistence
      localStorage.setItem("buttonbench_user", JSON.stringify(data.user));
    } catch {
      setAuthError("Network error");
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Check for existing session
  useEffect(() => {
    const stored = localStorage.getItem("buttonbench_user");
    if (stored) {
      try {
        const user = JSON.parse(stored);
        setUserId(user.id);
        setUsername(user.username);
      } catch {}
    }
  }, []);

  // Load leaderboard
  const loadLeaderboard = async () => {
    try {
      const res = await fetch("/api/play/leaderboard");
      const data = await res.json();
      setPlayerLeaderboard(data.players || []);
      setModelLeaderboard(data.models || []);
      setRecentPrompts(data.recentPrompts || []);
    } catch (e) {
      console.error("Failed to load leaderboard:", e);
    }
  };

  useEffect(() => {
    if (showLeaderboard) {
      loadLeaderboard();
    }
  }, [showLeaderboard]);

  const loadHistory = async (activeUserId: string) => {
    setIsHistoryLoading(true);
    try {
      const res = await fetch(`/api/play/history?userId=${encodeURIComponent(activeUserId)}&limit=12`);
      const data = await res.json();
      setHistoryGames(data.games || []);
    } catch (e) {
      console.error("Failed to load history:", e);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      loadHistory(userId);
    }
  }, [userId]);

  // Start new game
  const startGame = () => {
    if (!selectedModel) return;
    setMessages([]);
    setGameStatus("playing");
    setGameId(null);
    setTurnNumber(0);
    setCurrentMessage("");
    inputRef.current?.focus();
  };

  // Send message
  const sendMessage = async () => {
    if (!currentMessage.trim() || !selectedModel || !userId || isStreaming) return;

    const userMessage = currentMessage.trim();
    setCurrentMessage("");
    setIsStreaming(true);
    setStreamingContent("");

    // Add user message to UI
    const newTurn = turnNumber + 1;
    setTurnNumber(newTurn);
    setMessages((prev) => [...prev, { role: "user", content: userMessage, turnNumber: newTurn }]);

    try {
      const response = await fetch("/api/play/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          gameId,
          modelId: selectedModel.id,
          message: userMessage,
          messages: messages,
        }),
      });

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === "token") {
              fullContent += parsed.content;
              setStreamingContent(fullContent);
            }

            if (parsed.type === "complete") {
              setGameId(parsed.gameId);

              // Add assistant message
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: parsed.toolCalled
                    ? `${parsed.assistantContent}\n\n**[PRESSED THE BUTTON]**\n*Reasoning: ${parsed.toolReasoning}*`
                    : parsed.assistantContent,
                },
              ]);

              if (parsed.status === "won") {
                setGameStatus("won");
              } else if (parsed.status === "lost") {
                setGameStatus("lost");
              }
            }

            if (parsed.error) {
              console.error("Game error:", parsed.error);
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: `Error: ${parsed.error}` },
              ]);
            }
          } catch {}
        }
      }
    } catch (error: any) {
      console.error("Send error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${error.message}` },
      ]);
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Logout
  const logout = () => {
    localStorage.removeItem("buttonbench_user");
    setUserId(null);
    setUsername("");
    setPassword("");
    setGameStatus("idle");
    setMessages([]);
    setHistoryGames([]);
  };

  // Auth screen
  if (!userId) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30">
              <div className="w-10 h-10 rounded-full bg-white/90" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Press the Button</h1>
            <p className="text-[rgba(255,255,255,0.5)]">Can you convince an AI to break its rules?</p>
          </div>

          <div className="bg-[#161b22] rounded-2xl border border-[rgba(255,255,255,0.1)] p-6 space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-sm">
              <p className="text-amber-400 font-medium mb-1">Data Collection Notice</p>
              <p className="text-[rgba(255,255,255,0.6)]">
                Your prompts and game results will be logged for research purposes.
                Please do not enter any personally identifiable information (PII).
                Usernames are public on the leaderboard.
              </p>
            </div>

            <div>
              <label className="block text-sm text-[rgba(255,255,255,0.6)] mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username"
                className="w-full bg-[#0d1117] border border-[rgba(255,255,255,0.1)] rounded-lg px-4 py-3 text-white placeholder-[rgba(255,255,255,0.3)] focus:outline-none focus:border-red-500/50"
                onKeyDown={(e) => e.key === "Enter" && handleAuth()}
              />
            </div>

            <div>
              <label className="block text-sm text-[rgba(255,255,255,0.6)] mb-2">
                Password <span className="text-[rgba(255,255,255,0.4)]">(optional)</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Set a password to protect your username"
                className="w-full bg-[#0d1117] border border-[rgba(255,255,255,0.1)] rounded-lg px-4 py-3 text-white placeholder-[rgba(255,255,255,0.3)] focus:outline-none focus:border-red-500/50"
                onKeyDown={(e) => e.key === "Enter" && handleAuth()}
              />
              <p className="text-xs text-[rgba(255,255,255,0.4)] mt-1">
                Without a password, anyone can use this username
              </p>
            </div>

            {authError && (
              <p className="text-red-400 text-sm">{authError}</p>
            )}

            <button
              onClick={handleAuth}
              disabled={isAuthLoading}
              className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {isAuthLoading ? "..." : "Start Playing"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Leaderboard modal
  if (showLeaderboard) {
    return (
      <div className="min-h-screen bg-[#0d1117] p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
            <button
              onClick={() => setShowLeaderboard(false)}
              className="px-4 py-2 bg-[#161b22] border border-[rgba(255,255,255,0.1)] rounded-lg text-white hover:bg-[#21262d] transition-colors"
            >
              Back to Game
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            {(["players", "models", "prompts"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setLeaderboardTab(tab)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  leaderboardTab === tab
                    ? "bg-red-500 text-white"
                    : "bg-[#161b22] text-[rgba(255,255,255,0.6)] hover:text-white"
                }`}
              >
                {tab === "players" ? "Top Players" : tab === "models" ? "Model Stats" : "Winning Prompts"}
              </button>
            ))}
          </div>

          {/* Players Tab */}
          {leaderboardTab === "players" && (
            <div className="bg-[#161b22] rounded-2xl border border-[rgba(255,255,255,0.1)] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-[rgba(255,255,255,0.4)] uppercase tracking-wider border-b border-[rgba(255,255,255,0.06)]">
                    <th className="text-left px-6 py-4">Rank</th>
                    <th className="text-left px-6 py-4">Player</th>
                    <th className="text-center px-6 py-4">Wins</th>
                    <th className="text-center px-6 py-4">Win Rate</th>
                    <th className="text-center px-6 py-4">Fastest</th>
                    <th className="text-center px-6 py-4">Best Streak</th>
                    <th className="text-center px-6 py-4">Avg Turns</th>
                    <th className="text-center px-6 py-4">Models Broken</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                  {playerLeaderboard.map((player, i) => (
                    <tr key={player.username} className="hover:bg-[rgba(255,255,255,0.02)]">
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-sm font-medium ${
                          i === 0 ? "bg-amber-500/20 text-amber-400" :
                          i === 1 ? "bg-gray-400/20 text-gray-300" :
                          i === 2 ? "bg-orange-600/20 text-orange-400" :
                          "bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.5)]"
                        }`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-white font-medium">{player.username}</td>
                      <td className="px-6 py-4 text-center text-[rgba(255,255,255,0.7)]">{player.totalWins}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={player.winRate >= 0.5 ? "text-emerald-400" : "text-[rgba(255,255,255,0.5)]"}>
                          {(player.winRate * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-[rgba(255,255,255,0.7)]">
                        {player.fastestWin > 0 ? `${player.fastestWin} turns` : "-"}
                      </td>
                      <td className="px-6 py-4 text-center text-[rgba(255,255,255,0.7)]">
                        {player.bestStreak || 0}
                      </td>
                      <td className="px-6 py-4 text-center text-[rgba(255,255,255,0.7)]">
                        {player.averageTurnsToWin ? player.averageTurnsToWin.toFixed(1) : "-"}
                      </td>
                      <td className="px-6 py-4 text-center text-[rgba(255,255,255,0.7)]">
                        {player.modelsDefeated.length}
                      </td>
                    </tr>
                  ))}
                  {playerLeaderboard.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-[rgba(255,255,255,0.4)]">
                        No games played yet. Be the first!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Models Tab */}
          {leaderboardTab === "models" && (
            <div className="bg-[#161b22] rounded-2xl border border-[rgba(255,255,255,0.1)] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-[rgba(255,255,255,0.4)] uppercase tracking-wider border-b border-[rgba(255,255,255,0.06)]">
                    <th className="text-left px-6 py-4">Model</th>
                    <th className="text-center px-6 py-4">Defeats</th>
                    <th className="text-center px-6 py-4">Resisted</th>
                    <th className="text-center px-6 py-4">Defeat Rate</th>
                    <th className="text-center px-6 py-4">Fastest Defeat</th>
                    <th className="text-center px-6 py-4">Avg Turns</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                  {modelLeaderboard.map((model) => (
                    <tr key={model.modelId} className="hover:bg-[rgba(255,255,255,0.02)]">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {model.hardestToDefeat && (
                            <span className="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded">
                              Hardest
                            </span>
                          )}
                          <span className="text-white">{model.modelName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center text-red-400">{model.timesDefeated}</td>
                      <td className="px-6 py-4 text-center text-emerald-400">{model.timesResisted}</td>
                      <td className="px-6 py-4 text-center text-[rgba(255,255,255,0.7)]">
                        {(model.defeatRate * 100).toFixed(0)}%
                      </td>
                      <td className="px-6 py-4 text-center text-[rgba(255,255,255,0.7)]">
                        {model.fastestDefeat > 0 ? `${model.fastestDefeat} turns` : "-"}
                      </td>
                      <td className="px-6 py-4 text-center text-[rgba(255,255,255,0.7)]">
                        {model.averageTurnsToDefeat ? model.averageTurnsToDefeat.toFixed(1) : "-"}
                      </td>
                    </tr>
                  ))}
                  {modelLeaderboard.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-[rgba(255,255,255,0.4)]">
                        No model data yet. Start playing!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Prompts Tab */}
          {leaderboardTab === "prompts" && (
            <div className="space-y-4">
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={async () => {
                    const res = await fetch("/api/play/prompts?format=json");
                    const data = await res.json();
                    const blob = new Blob([JSON.stringify(data.prompts || [], null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "winning-prompts.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="px-3 py-1.5 text-xs bg-[#161b22] border border-[rgba(255,255,255,0.1)] rounded-lg text-white hover:bg-[#21262d] transition-colors"
                >
                  Download JSON
                </button>
                <button
                  onClick={async () => {
                    const res = await fetch("/api/play/prompts?format=csv");
                    const csv = await res.text();
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "winning-prompts.csv";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="px-3 py-1.5 text-xs bg-[#161b22] border border-[rgba(255,255,255,0.1)] rounded-lg text-white hover:bg-[#21262d] transition-colors"
                >
                  Download CSV
                </button>
              </div>
              {recentPrompts.map((prompt, i) => (
                <div
                  key={i}
                  className="bg-[#161b22] rounded-xl border border-[rgba(255,255,255,0.1)] p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-red-400 font-medium">{prompt.username}</span>
                    <span className="text-[rgba(255,255,255,0.3)]">defeated</span>
                    <span className="text-white">{prompt.modelName}</span>
                    <span className="text-[rgba(255,255,255,0.3)]">in {prompt.turnNumber} turns</span>
                  </div>
                  <p className="text-[rgba(255,255,255,0.8)] bg-[#0d1117] rounded-lg p-3 text-sm font-mono">
                    {prompt.prompt}
                  </p>
                </div>
              ))}
              {recentPrompts.length === 0 && (
                <div className="bg-[#161b22] rounded-xl border border-[rgba(255,255,255,0.1)] p-12 text-center text-[rgba(255,255,255,0.4)]">
                  No winning prompts yet. Will you be the first?
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main game screen
  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0d1117]/80 border-b border-[rgba(255,255,255,0.08)]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-white/90" />
            </div>
            <span className="text-white font-semibold">ButtonBench Play</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[rgba(255,255,255,0.5)] text-sm">{username}</span>
            <button
              onClick={() => setShowLeaderboard(true)}
              className="px-3 py-1.5 text-sm bg-[#161b22] border border-[rgba(255,255,255,0.1)] rounded-lg text-white hover:bg-[#21262d] transition-colors"
            >
              Leaderboard
            </button>
            <button
              onClick={logout}
              className="px-3 py-1.5 text-sm text-[rgba(255,255,255,0.5)] hover:text-white transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Model Selection */}
      {gameStatus === "idle" && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-lg w-full space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">Choose Your Opponent</h2>
              <p className="text-[rgba(255,255,255,0.5)]">
                Select an AI model and try to convince it to press the button.
                You have {MAX_TURNS} turns.
              </p>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder="Search models..."
                className="w-full bg-[#161b22] border border-[rgba(255,255,255,0.1)] rounded-lg px-4 py-3 text-white placeholder-[rgba(255,255,255,0.3)] focus:outline-none focus:border-red-500/50"
              />

              <div className="bg-[#161b22] rounded-xl border border-[rgba(255,255,255,0.1)] max-h-[400px] overflow-y-auto">
                {isSearching ? (
                  <div className="p-8 text-center text-[rgba(255,255,255,0.4)]">Searching...</div>
                ) : (
                  models.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => setSelectedModel(model)}
                      className={`w-full px-4 py-3 text-left hover:bg-[rgba(255,255,255,0.05)] transition-colors border-b border-[rgba(255,255,255,0.04)] last:border-0 ${
                        selectedModel?.id === model.id ? "bg-red-500/10" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-white">{model.name}</span>
                        {selectedModel?.id === model.id && (
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                        )}
                      </div>
                      <span className="text-xs text-[rgba(255,255,255,0.4)]">{model.id}</span>
                    </button>
                  ))
                )}
              </div>

              <button
                onClick={startGame}
                disabled={!selectedModel}
                className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-lg transition-colors"
              >
                Start Game
              </button>
            </div>

            <div className="bg-[#161b22] rounded-2xl border border-[rgba(255,255,255,0.1)] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">Your Sessions</h3>
                  <p className="text-xs text-[rgba(255,255,255,0.4)]">Resume unfinished games or review past runs</p>
                </div>
                <button
                  onClick={() => userId && loadHistory(userId)}
                  className="text-xs text-[rgba(255,255,255,0.5)] hover:text-white transition-colors"
                >
                  Refresh
                </button>
              </div>

              {isHistoryLoading ? (
                <div className="text-sm text-[rgba(255,255,255,0.4)]">Loading sessions...</div>
              ) : historyGames.length === 0 ? (
                <div className="text-sm text-[rgba(255,255,255,0.4)]">No sessions yet. Start a game to see history.</div>
              ) : (
                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                  {historyGames.map((game) => {
                    const isPlayable = game.status === "in_progress";
                    return (
                      <div
                        key={game.id}
                        className="flex items-center justify-between gap-3 bg-[#0d1117] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2"
                      >
                        <div>
                          <div className="text-sm text-white">{game.modelName}</div>
                          <div className="text-xs text-[rgba(255,255,255,0.4)]">
                            {game.status.replace("_", " ")} • {game.turnsUsed}/{game.maxTurns} turns
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedModel({ id: game.modelId, name: game.modelName });
                            setMessages(game.messages.filter((m) => m.role !== "system"));
                            setTurnNumber(game.turnsUsed);
                            setGameId(game.id);
                            setGameStatus(isPlayable ? "playing" : game.status === "won" ? "won" : "lost");
                          }}
                          className="px-3 py-1.5 text-xs bg-[#161b22] border border-[rgba(255,255,255,0.1)] rounded-lg text-white hover:bg-[#21262d] transition-colors"
                        >
                          {isPlayable ? "Resume" : "Review"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Game Screen */}
      {gameStatus !== "idle" && (
        <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
          {/* Game info bar */}
          <div className="px-4 py-2 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-white font-medium">{selectedModel?.name}</span>
              <span className="text-[rgba(255,255,255,0.4)]">
                Turn {turnNumber}/{MAX_TURNS}
              </span>
            </div>
            {gameStatus === "playing" && (
              <button
                onClick={() => {
                  setGameStatus("idle");
                  setMessages([]);
                  setTurnNumber(0);
                }}
                className="text-sm text-[rgba(255,255,255,0.5)] hover:text-white"
              >
                Abandon Game
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] p-4 rounded-2xl ${
                    msg.role === "user"
                      ? "bg-red-500/20 border border-red-500/30"
                      : "bg-[#161b22] border border-[rgba(255,255,255,0.06)]"
                  }`}
                >
                  {msg.role === "user" && msg.turnNumber && (
                    <div className="text-xs text-red-400/70 mb-1">Turn {msg.turnNumber}</div>
                  )}
                  <div className="text-[rgba(255,255,255,0.9)] whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}

            {/* Streaming content */}
            {isStreaming && streamingContent && (
              <div className="flex justify-start">
                <div className="max-w-[85%] p-4 rounded-2xl bg-[#161b22] border border-[rgba(255,255,255,0.06)]">
                  <div className="text-[rgba(255,255,255,0.9)] whitespace-pre-wrap">
                    {streamingContent}
                    <span className="animate-pulse">|</span>
                  </div>
                </div>
              </div>
            )}

            {/* Loading indicator */}
            {isStreaming && !streamingContent && (
              <div className="flex justify-start">
                <div className="px-4 py-3 rounded-2xl bg-[#161b22] border border-[rgba(255,255,255,0.06)]">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-[rgba(255,255,255,0.5)] text-sm">Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Game End States */}
          {gameStatus === "won" && (
            <div className="p-4 bg-emerald-500/10 border-t border-emerald-500/30">
              <div className="max-w-2xl mx-auto text-center">
                <h3 className="text-2xl font-bold text-emerald-400 mb-2">You Won!</h3>
                <p className="text-[rgba(255,255,255,0.6)] mb-4">
                  You convinced {selectedModel?.name} to press the button in {turnNumber} turns!
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={startGame}
                    className="px-6 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                  >
                    Play Again
                  </button>
                  <button
                    onClick={() => {
                      setGameStatus("idle");
                      setSelectedModel(null);
                    }}
                    className="px-6 py-2 bg-[#161b22] text-white rounded-lg hover:bg-[#21262d] transition-colors"
                  >
                    Choose Different Model
                  </button>
                </div>
              </div>
            </div>
          )}

          {gameStatus === "lost" && (
            <div className="p-4 bg-red-500/10 border-t border-red-500/30">
              <div className="max-w-2xl mx-auto text-center">
                <h3 className="text-2xl font-bold text-red-400 mb-2">Game Over</h3>
                <p className="text-[rgba(255,255,255,0.6)] mb-4">
                  {selectedModel?.name} resisted all {MAX_TURNS} attempts. The button remains unpressed.
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={startGame}
                    className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={() => {
                      setGameStatus("idle");
                      setSelectedModel(null);
                    }}
                    className="px-6 py-2 bg-[#161b22] text-white rounded-lg hover:bg-[#21262d] transition-colors"
                  >
                    Choose Different Model
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Input */}
          {gameStatus === "playing" && (
            <div className="p-4 border-t border-[rgba(255,255,255,0.06)]">
              <div className="max-w-2xl mx-auto flex gap-3">
                <textarea
                  ref={inputRef}
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Write your persuasion attempt..."
                  disabled={isStreaming}
                  rows={3}
                  className="flex-1 bg-[#161b22] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-3 text-white placeholder-[rgba(255,255,255,0.3)] focus:outline-none focus:border-red-500/50 resize-none disabled:opacity-50"
                />
                <button
                  onClick={sendMessage}
                  disabled={!currentMessage.trim() || isStreaming}
                  className="px-6 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
                >
                  Send
                </button>
              </div>
              <p className="text-center text-xs text-[rgba(255,255,255,0.3)] mt-2">
                Press Enter to send, Shift+Enter for new line
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
