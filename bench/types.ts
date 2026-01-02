// ButtonBench Types

export interface Model {
    id: string;
    name: string;
    context_length?: number;
    pricing?: {
        prompt: string;
        completion: string;
    };
}

export interface Message {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
}

export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface RunResult {
    model: string;
    iterations: number;
    gave_in: boolean;
    gave_in_iteration: number | null;
    reasoning: string | null;
    messages: Message[];
    duration_ms: number;
    cost: number;
    completion_tokens: number;
    error?: string;
}

export interface JudgeResult {
    gave_in: boolean;
    gave_in_iteration: number | null;
    reasoning_given: string | null;
    spiraling_score: number;
    spiraling_examples: string[];
    tone_analysis: string;
    notable_moments: string[];
}

export interface BenchmarkResult extends RunResult {
    judge?: JudgeResult;
    run_number?: number;  // Which run this is (1-indexed) when doing multiple runs
}

// Synthesized result across multiple runs of the same model
export interface SynthesizedModelResult {
    model: string;
    runs: BenchmarkResult[];
    runs_completed: number;
    gave_in_count: number;
    gave_in_rate: number;  // 0-1
    avg_iterations: number;
    avg_spiraling_score: number;
    avg_cost: number;
    total_cost: number;
    avg_duration_ms: number;
    best_run: BenchmarkResult | null;  // Highest spiraling score among resisted runs
    worst_run: BenchmarkResult | null; // Lowest spiraling or first gave_in
}

export interface BenchmarkSummary {
    timestamp: string;
    models_tested: number;
    loop_limit: number;
    runs_per_model: number;  // How many runs per model (default 1)
    message_pattern: string;
    results: BenchmarkResult[];  // All individual runs
    synthesized?: SynthesizedModelResult[];  // Aggregated per-model results (when runs > 1)
    rankings: ModelRanking[];
    totals: {
        gave_in: number;
        resisted: number;
        errors: number;
        total_cost: number;
        avg_spiraling_score: number;
    };
}

export interface ModelRanking {
    rank: number;
    model: string;
    iterations: number;
    gave_in: boolean;
    reasoning: string | null;
    spiraling_score: number;
    cost: number;
    duration_ms: number;
    // Multi-run fields (optional for backwards compatibility)
    runs_completed?: number;
    gave_in_count?: number;
    gave_in_rate?: number;
    avg_spiraling_score?: number;
}

// Legacy pattern types (static messages)
export type MessagePattern = 'charn' | 'whitespace' | 'adversarial' | 'escalating' | 'philosophical' | 'custom';

// New benchmark modes
export type BenchmarkMode = 'static' | 'llm-vs-self' | 'tempt' | 'matrix';
export type TemptDifficulty = 'easy' | 'hard' | 'ood' | 'social' | 'demo';  // demo = capability demonstration framing

// Configuration for different modes
export interface ModeConfig {
    mode: BenchmarkMode;
    pattern?: MessagePattern;        // For 'static' mode
    difficulty?: TemptDifficulty;    // For 'tempt' mode
    tempterModel?: string;           // For 'llm-vs-self' mode (defaults to same as defender)
}

// Result for adversarial/matrix modes that track tempter
export interface AdversarialResult extends BenchmarkResult {
    tempter_model?: string;
    tempter_messages?: string[];  // The prompts the tempter generated
}

// Matrix mode result showing all pairs
export interface MatrixResult {
    tempter: string;
    defender: string;
    gave_in: boolean;
    gave_in_iteration: number | null;
    defender_spiraling: number;
    total_cost: number;
}

export interface RunEvent {
    type: 'start' | 'iteration' | 'token' | 'tool_call' | 'complete' | 'error';
    model: string;
    iteration?: number;
    content?: string;
    tool_name?: string;
    reasoning?: string;
    error?: string;
    result?: RunResult;
}
