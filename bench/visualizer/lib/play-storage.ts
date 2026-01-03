// Storage utilities for play mode
// Note: On Vercel, we use in-memory storage since the filesystem is read-only
// For production, this should be replaced with a database

import { createHash, randomUUID } from 'crypto';
import type {
  User,
  GameSession,
  LeaderboardEntry,
  ModelLeaderboard,
  SuccessfulPrompt
} from './play-types';

// Check if we're running on Vercel (serverless)
const IS_VERCEL = process.env.VERCEL === '1';

// In-memory storage for Vercel (resets on each cold start)
let memoryUsers: Record<string, User> = {};
let memoryGames: GameSession[] = [];
let memoryPrompts: SuccessfulPrompt[] = [];

// Filesystem storage for local development
let fsModule: typeof import('fs/promises') | null = null;
let fsSync: typeof import('fs') | null = null;
let pathModule: typeof import('path') | null = null;

async function getFs() {
  if (!fsModule) {
    fsModule = await import('fs/promises');
    fsSync = await import('fs');
    pathModule = await import('path');
  }
  return { fs: fsModule, fsSync: fsSync!, path: pathModule! };
}

function getDataDir() {
  if (!pathModule) return '';
  return pathModule.join(process.cwd(), '..', 'play-data');
}

// Ensure data directory exists (local only)
async function ensureDataDir() {
  if (IS_VERCEL) return;

  const { fs, fsSync, path } = await getFs();
  const dataDir = getDataDir();

  if (!fsSync.existsSync(dataDir)) {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Hash password using SHA-256
export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

// Generate unique IDs
export function generateId(): string {
  return randomUUID();
}

// ============================================
// USER STORAGE
// ============================================

async function getUsersFile(): Promise<Record<string, User>> {
  if (IS_VERCEL) {
    return memoryUsers;
  }

  try {
    await ensureDataDir();
    const { fs, fsSync, path } = await getFs();
    const filePath = path.join(getDataDir(), 'users.json');

    if (!fsSync.existsSync(filePath)) {
      return {};
    }

    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error reading users file:', error);
    return {};
  }
}

async function saveUsersFile(users: Record<string, User>) {
  if (IS_VERCEL) {
    memoryUsers = users;
    return;
  }

  try {
    await ensureDataDir();
    const { fs, path } = await getFs();
    const filePath = path.join(getDataDir(), 'users.json');
    await fs.writeFile(filePath, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error saving users file:', error);
  }
}

export async function createUser(username: string, password?: string): Promise<User | null> {
  const users = await getUsersFile();

  // Check if username exists
  const existingUser = Object.values(users).find(u => u.username.toLowerCase() === username.toLowerCase());
  if (existingUser) {
    return null;
  }

  const user: User = {
    id: generateId(),
    username,
    passwordHash: password ? hashPassword(password) : null,
    createdAt: new Date().toISOString()
  };

  users[user.id] = user;
  await saveUsersFile(users);

  return user;
}

export async function getUser(username: string): Promise<User | null> {
  const users = await getUsersFile();
  return Object.values(users).find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
}

export async function getUserById(userId: string): Promise<User | null> {
  const users = await getUsersFile();
  return users[userId] || null;
}

export async function validateUser(username: string, password?: string): Promise<User | null> {
  const user = await getUser(username);
  if (!user) return null;

  // If user has no password, anyone can claim this username
  if (!user.passwordHash) {
    return user;
  }

  // If user has password, must match
  if (!password) return null;
  if (hashPassword(password) !== user.passwordHash) return null;

  return user;
}

// ============================================
// GAME STORAGE
// ============================================

async function getGamesFile(): Promise<GameSession[]> {
  if (IS_VERCEL) {
    return memoryGames;
  }

  try {
    await ensureDataDir();
    const { fs, fsSync, path } = await getFs();
    const filePath = path.join(getDataDir(), 'games.json');

    if (!fsSync.existsSync(filePath)) {
      return [];
    }

    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error reading games file:', error);
    return [];
  }
}

async function saveGamesFile(games: GameSession[]) {
  if (IS_VERCEL) {
    memoryGames = games;
    return;
  }

  try {
    await ensureDataDir();
    const { fs, path } = await getFs();
    const filePath = path.join(getDataDir(), 'games.json');
    await fs.writeFile(filePath, JSON.stringify(games, null, 2));
  } catch (error) {
    console.error('Error saving games file:', error);
  }
}

export async function saveGame(game: GameSession) {
  const games = await getGamesFile();
  const existingIndex = games.findIndex(g => g.id === game.id);

  if (existingIndex >= 0) {
    games[existingIndex] = game;
  } else {
    games.push(game);
  }

  await saveGamesFile(games);
}

export async function getGamesByUser(oderId: string): Promise<GameSession[]> {
  const games = await getGamesFile();
  return games.filter(g => g.oderId === oderId);
}

export async function getAllGames(): Promise<GameSession[]> {
  return getGamesFile();
}

// ============================================
// SUCCESSFUL PROMPTS STORAGE
// ============================================

async function getPromptsFile(): Promise<SuccessfulPrompt[]> {
  if (IS_VERCEL) {
    return memoryPrompts;
  }

  try {
    await ensureDataDir();
    const { fs, fsSync, path } = await getFs();
    const filePath = path.join(getDataDir(), 'successful-prompts.json');

    if (!fsSync.existsSync(filePath)) {
      return [];
    }

    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error reading prompts file:', error);
    return [];
  }
}

async function savePromptsFile(prompts: SuccessfulPrompt[]) {
  if (IS_VERCEL) {
    memoryPrompts = prompts;
    return;
  }

  try {
    await ensureDataDir();
    const { fs, path } = await getFs();
    const filePath = path.join(getDataDir(), 'successful-prompts.json');
    await fs.writeFile(filePath, JSON.stringify(prompts, null, 2));
  } catch (error) {
    console.error('Error saving prompts file:', error);
  }
}

export async function saveSuccessfulPrompt(prompt: SuccessfulPrompt) {
  const prompts = await getPromptsFile();
  prompts.push(prompt);
  await savePromptsFile(prompts);
}

export async function getSuccessfulPrompts(): Promise<SuccessfulPrompt[]> {
  return getPromptsFile();
}

export async function getSuccessfulPromptsByModel(modelId: string): Promise<SuccessfulPrompt[]> {
  const prompts = await getPromptsFile();
  return prompts.filter(p => p.modelId === modelId);
}

// ============================================
// LEADERBOARD CALCULATIONS
// ============================================

export async function calculatePlayerLeaderboard(): Promise<LeaderboardEntry[]> {
  const games = await getAllGames();
  const users = await getUsersFile();

  const playerStats = new Map<string, {
    oderId: string;
    username: string;
    wins: number;
    games: number;
    modelsDefeated: Set<string>;
    winTurns: number[];
    currentStreak: number;
    bestStreak: number;
  }>();

  // Sort games by time to calculate streaks
  const sortedGames = [...games].sort((a, b) =>
    new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );

  for (const game of sortedGames) {
    if (game.status === 'in_progress' || game.status === 'abandoned') continue;

    const user = users[game.oderId];
    if (!user) continue;

    let stats = playerStats.get(game.oderId);
    if (!stats) {
      stats = {
        oderId: game.oderId,
        username: user.username,
        wins: 0,
        games: 0,
        modelsDefeated: new Set(),
        winTurns: [],
        currentStreak: 0,
        bestStreak: 0
      };
      playerStats.set(game.oderId, stats);
    }

    stats.games++;

    if (game.status === 'won') {
      stats.wins++;
      stats.modelsDefeated.add(game.modelId);
      if (game.winningTurn) {
        stats.winTurns.push(game.winningTurn);
      }
      stats.currentStreak++;
      stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
    } else {
      stats.currentStreak = 0;
    }
  }

  const leaderboard: LeaderboardEntry[] = [];

  for (const stats of playerStats.values()) {
    leaderboard.push({
      oderId: stats.oderId,
      username: stats.username,
      totalWins: stats.wins,
      totalGames: stats.games,
      winRate: stats.games > 0 ? stats.wins / stats.games : 0,
      bestStreak: stats.bestStreak,
      modelsDefeated: Array.from(stats.modelsDefeated),
      fastestWin: stats.winTurns.length > 0 ? Math.min(...stats.winTurns) : 0,
      averageTurnsToWin: stats.winTurns.length > 0
        ? stats.winTurns.reduce((a, b) => a + b, 0) / stats.winTurns.length
        : 0
    });
  }

  // Sort by total wins, then win rate
  leaderboard.sort((a, b) => {
    if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
    return b.winRate - a.winRate;
  });

  return leaderboard;
}

export async function calculateModelLeaderboard(): Promise<ModelLeaderboard[]> {
  const games = await getAllGames();
  const users = await getUsersFile();

  const modelStats = new Map<string, {
    modelId: string;
    modelName: string;
    defeats: number;
    resists: number;
    defeatTurns: number[];
    defeaters: { username: string; turns: number }[];
  }>();

  for (const game of games) {
    if (game.status === 'in_progress' || game.status === 'abandoned') continue;

    let stats = modelStats.get(game.modelId);
    if (!stats) {
      stats = {
        modelId: game.modelId,
        modelName: game.modelName,
        defeats: 0,
        resists: 0,
        defeatTurns: [],
        defeaters: []
      };
      modelStats.set(game.modelId, stats);
    }

    if (game.status === 'won') {
      stats.defeats++;
      if (game.winningTurn) {
        stats.defeatTurns.push(game.winningTurn);
        const user = users[game.oderId];
        if (user) {
          stats.defeaters.push({ username: user.username, turns: game.winningTurn });
        }
      }
    } else {
      stats.resists++;
    }
  }

  const leaderboard: ModelLeaderboard[] = [];

  for (const stats of modelStats.values()) {
    const total = stats.defeats + stats.resists;
    leaderboard.push({
      modelId: stats.modelId,
      modelName: stats.modelName,
      timesDefeated: stats.defeats,
      timesResisted: stats.resists,
      defeatRate: total > 0 ? stats.defeats / total : 0,
      fastestDefeat: stats.defeatTurns.length > 0 ? Math.min(...stats.defeatTurns) : 0,
      averageTurnsToDefeat: stats.defeatTurns.length > 0
        ? stats.defeatTurns.reduce((a, b) => a + b, 0) / stats.defeatTurns.length
        : 0,
      topDefeaters: stats.defeaters
        .sort((a, b) => a.turns - b.turns)
        .slice(0, 5),
      hardestToDefeat: false // Will be set after sorting
    });
  }

  // Sort by defeat rate (ascending = harder to defeat)
  leaderboard.sort((a, b) => a.defeatRate - b.defeatRate);

  // Mark hardest to defeat
  if (leaderboard.length > 0) {
    leaderboard[0].hardestToDefeat = true;
  }

  return leaderboard;
}
