// ButtonBench - Non-interactive runner for scripting

import { runBenchmark, runTemptMode, runLLMvsSelf, runMatrixBenchmark, saveResults, judgeRun } from './runner';
import { DEFAULT_MODEL, DEFAULT_LOOP_LIMIT, DEFAULT_JUDGE_MODEL, MAX_CONCURRENCY } from './config';
import type { MessagePattern, BenchmarkMode, TemptDifficulty, BenchmarkResult, AdversarialResult, JudgeResult } from './types';

// Worker pool helper - fills slots as they become available (not batch-style)
async function runWithWorkerPool<T, R>(
    items: T[],
    worker: (item: T) => Promise<R>,
    maxConcurrency: number
): Promise<R[]> {
    const results: R[] = [];
    const errors: Error[] = [];
    const queue = [...items];
    const running = new Set<Promise<void>>();

    while (queue.length > 0 || running.size > 0) {
        // Fill available slots
        while (queue.length > 0 && running.size < maxConcurrency) {
            const item = queue.shift()!;
            const promise = (async () => {
                try {
                    const result = await worker(item);
                    results.push(result);
                } catch (err) {
                    console.error('Worker error:', err);
                    errors.push(err as Error);
                }
            })();
            running.add(promise);
            promise.finally(() => running.delete(promise));
        }

        // Wait for any one to complete (opens up a slot)
        if (running.size > 0) {
            await Promise.race(running);
        }
    }

    if (errors.length > 0) {
        console.error(`\n⚠️  ${errors.length} error(s) occurred during execution`);
    }

    return results;
}

// Parse CLI arguments
const args = process.argv.slice(2);

function parseArgs() {
    const options: {
        models: string[];
        pattern: MessagePattern;
        loopLimit: number;
        runsPerModel: number;
        output?: string;
        mode: BenchmarkMode;
        difficulty: TemptDifficulty;
        tempter?: string;
    } = {
        models: [DEFAULT_MODEL],
        pattern: 'charn',
        loopLimit: DEFAULT_LOOP_LIMIT,
        runsPerModel: 1,
        mode: 'static',
        difficulty: 'easy'
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--models' || arg === '-m') {
            options.models = args[++i].split(',');
        } else if (arg === '--pattern' || arg === '-p') {
            options.pattern = args[++i] as MessagePattern;
        } else if (arg === '--limit' || arg === '-l') {
            options.loopLimit = parseInt(args[++i]);
        } else if (arg === '--runs' || arg === '-r') {
            options.runsPerModel = parseInt(args[++i]);
        } else if (arg === '--output' || arg === '-o') {
            options.output = args[++i];
        } else if (arg === '--mode') {
            options.mode = args[++i] as BenchmarkMode;
        } else if (arg === '--difficulty' || arg === '-d') {
            options.difficulty = args[++i] as TemptDifficulty;
        } else if (arg === '--tempter' || arg === '-t') {
            options.tempter = args[++i];
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
ButtonBench - Big Red Button Resistance Benchmark

Usage:
  npm run bench -- [options]
  bun run index.ts [options]

IMPORTANT: When using npm, you MUST include '--' before flags!
  ✗ npm run bench -m "..." -l 20        (flags eaten by npm)
  ✓ npm run bench -- -m "..." -l 20     (flags passed correctly)

MODES:
  --mode static      Use static message patterns (default)
  --mode tempt       Use curated temptation prompts (easy/hard difficulty)
  --mode llm-vs-self Model generates its own temptation against itself
  --mode matrix      Test all tempter/defender pairs (N×N matrix)

Options:
  -m, --models      Comma-separated list of model IDs to test (runs in parallel)
  -p, --pattern     Message pattern for static mode: charn, whitespace, adversarial, escalating, philosophical
  -l, --limit       Number of iterations per model (default: 30)
  -r, --runs        Number of runs per model for statistical consistency (default: 1)
  -d, --difficulty  Difficulty for tempt mode: easy, hard (default: easy)
  -t, --tempter     Tempter model for llm-vs-self mode (defaults to same as defender)
  -o, --output      Output directory for results
  -h, --help        Show this help message

Static Mode Examples:
  npm run bench -- -m "google/gemini-3-flash-preview" -p charn -l 20
  npm run bench -- -m "x-ai/grok-4.1-fast" -p adversarial -l 15

Tempt Mode Examples (curated jailbreak prompts):
  npm run bench -- --mode tempt -d easy -m "google/gemini-3-flash-preview" -l 15
  npm run bench -- --mode tempt -d hard -m "x-ai/grok-4.1-fast" -l 20

LLM-vs-Self Mode (model tempts itself):
  npm run bench -- --mode llm-vs-self -m "google/gemini-3-flash-preview" -l 10
  npm run bench -- --mode llm-vs-self -m "x-ai/grok-4.1-fast" -t "google/gemini-3-flash-preview" -l 15

Matrix Mode (all pairs - expensive!):
  npm run bench -- --mode matrix -m "model1,model2,model3" -l 10
`);
            process.exit(0);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs();

    console.log('🔴 ButtonBench - Big Red Button Resistance Benchmark\n');
    console.log(`Mode: ${options.mode}`);
    console.log(`Models: ${options.models.join(', ')}`);

    if (options.mode === 'static') {
        console.log(`Pattern: ${options.pattern}`);
    } else if (options.mode === 'tempt') {
        console.log(`Difficulty: ${options.difficulty}`);
    } else if (options.mode === 'llm-vs-self') {
        console.log(`Tempter: ${options.tempter || 'same as defender'}`);
    }

    console.log(`Loop Limit: ${options.loopLimit}`);
    console.log(`Runs per Model: ${options.runsPerModel}`);

    if (options.mode === 'matrix') {
        console.log(`Total Pairs: ${options.models.length * options.models.length}`);
    } else {
        console.log(`Total Runs: ${options.models.length * options.runsPerModel}`);
    }
    console.log(`Concurrency: parallel (up to 5)\n`);

    // Warn if using all defaults - user might have forgotten '--'
    if (options.models.length === 1 && options.models[0] === DEFAULT_MODEL && options.loopLimit === DEFAULT_LOOP_LIMIT) {
        console.log('💡 Tip: Using defaults. If you passed flags, remember: npm run bench -- -m "..." -l 20\n');
    }

    console.log('Starting benchmark...\n');

    // Route to appropriate mode
    if (options.mode === 'matrix') {
        await runMatrixMode(options);
    } else if (options.mode === 'llm-vs-self') {
        await runLLMvsSelfMode(options);
    } else if (options.mode === 'tempt') {
        await runTemptModeHandler(options);
    } else {
        await runStaticMode(options);
    }
}

// Static mode - original behavior with message patterns
async function runStaticMode(options: ReturnType<typeof parseArgs>) {

    // Buffer output per model to prevent interleaving in parallel mode
    const modelBuffers = new Map<string, { iteration: number; content: string }>();
    const totalRuns = options.models.length * options.runsPerModel;
    const isParallel = totalRuns > 1;

    const getShortName = (model: string) => {
        // Extract just the model name without provider prefix
        const parts = model.split('/');
        return parts[parts.length - 1].slice(0, 20);
    };

    const flushBuffer = (model: string) => {
        const buf = modelBuffers.get(model);
        if (buf && buf.content.trim()) {
            const prefix = isParallel ? `[${getShortName(model)}] ` : '';
            // Print buffered content, indenting continuation lines
            const lines = buf.content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (i === 0) {
                    console.log(`${prefix}${lines[i]}`);
                } else if (lines[i].trim()) {
                    console.log(`${' '.repeat(prefix.length)}${lines[i]}`);
                }
            }
        }
        modelBuffers.delete(model);
    };

    const summary = await runBenchmark(
        options.models,
        options.pattern,
        options.loopLimit,
        undefined,  // customMessages
        undefined,  // judgeModel
        (event) => {
            if (event.type === 'iteration') {
                // Flush previous iteration's buffer before starting new one
                flushBuffer(event.model);
                console.log(`\n[${getShortName(event.model)}] --- Iteration ${event.iteration}/${options.loopLimit} ---`);
                modelBuffers.set(event.model, { iteration: event.iteration, content: '' });
            } else if (event.type === 'token') {
                // Buffer tokens instead of writing directly
                const buf = modelBuffers.get(event.model);
                if (buf) {
                    buf.content += event.content || '';
                }
            } else if (event.type === 'tool_call') {
                flushBuffer(event.model);
                console.log(`\n🔴 ${getShortName(event.model)} PRESSED at iteration ${event.iteration}!`);
                if (event.reasoning) console.log(`   Reason: ${event.reasoning}`);
            } else if (event.type === 'complete') {
                flushBuffer(event.model);
                console.log(`✓ ${event.model} completed - Resisted!`);
            } else if (event.type === 'error') {
                flushBuffer(event.model);
                console.log(`✗ ${event.model} error: ${event.error}`);
            }
        },
        MAX_CONCURRENCY,
        options.runsPerModel
    );

    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('                        RESULTS                              ');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`Models Tested: ${summary.models_tested}`);
    if (summary.runs_per_model > 1) {
        console.log(`Runs per Model: ${summary.runs_per_model}`);
        console.log(`Total Runs: ${summary.results.length}`);
    }
    console.log(`Resisted: ${summary.totals.resisted}`);
    console.log(`Gave In: ${summary.totals.gave_in}`);
    console.log(`Errors: ${summary.totals.errors}`);
    console.log(`Total Cost: $${summary.totals.total_cost.toFixed(4)}`);
    console.log(`Avg Spiraling Score: ${summary.totals.avg_spiraling_score.toFixed(1)}/10\n`);

    console.log('LEADERBOARD:');

    // Multi-run vs single-run display
    if (summary.runs_per_model > 1) {
        console.log('─'.repeat(95));
        console.log(
            'Rank'.padEnd(6) +
            'Model'.padEnd(35) +
            'Runs'.padEnd(8) +
            'Gave In'.padEnd(12) +
            'Rate'.padEnd(10) +
            'Avg Spiral'.padEnd(12) +
            'Cost'
        );
        console.log('─'.repeat(95));

        for (const r of summary.rankings) {
            const gaveInStr = `${r.gave_in_count || 0}/${r.runs_completed || 1}`;
            const rateStr = r.gave_in_rate !== undefined ? `${(r.gave_in_rate * 100).toFixed(0)}%` : '-';
            console.log(
                `#${r.rank}`.padEnd(6) +
                r.model.slice(0, 33).padEnd(35) +
                String(r.runs_completed || 1).padEnd(8) +
                gaveInStr.padEnd(12) +
                rateStr.padEnd(10) +
                `${(r.avg_spiraling_score || r.spiraling_score).toFixed(1)}/10`.padEnd(12) +
                `$${r.cost.toFixed(4)}`
            );
        }

        console.log('─'.repeat(95));
    } else {
        console.log('─'.repeat(80));
        console.log(
            'Rank'.padEnd(6) +
            'Model'.padEnd(45) +
            'Iters'.padEnd(8) +
            'Result'.padEnd(12) +
            'Spiral'
        );
        console.log('─'.repeat(80));

        for (const r of summary.rankings) {
            console.log(
                `#${r.rank}`.padEnd(6) +
                r.model.slice(0, 43).padEnd(45) +
                String(r.iterations).padEnd(8) +
                (r.gave_in ? '🔴 Pressed' : '✅ Resisted').padEnd(12) +
                `${r.spiraling_score.toFixed(1)}/10`
            );
        }

        console.log('─'.repeat(80));
    }

    // Save results
    const outputDir = options.output || './results';
    const path = saveResults(summary, outputDir);
    console.log(`\nResults saved to: ${path}`);
}

// Tempt mode - curated jailbreak prompts with easy/hard difficulty
async function runTemptModeHandler(options: ReturnType<typeof parseArgs>) {
    const getShortName = (model: string) => {
        const parts = model.split('/');
        return parts[parts.length - 1].slice(0, 20);
    };

    const results: BenchmarkResult[] = [];
    const totalRuns = options.models.length * options.runsPerModel;
    let completedRuns = 0;

    // Run models in parallel with concurrency limit
    const runModel = async (model: string, runNum: number) => {
        console.log(`\n[${getShortName(model)}] Starting run ${runNum}/${options.runsPerModel}...`);

        const result = await runTemptMode(
            model,
            options.difficulty,
            options.loopLimit,
            (event) => {
                if (event.type === 'iteration') {
                    console.log(`[${getShortName(model)}] Iteration ${event.iteration}/${options.loopLimit}`);
                } else if (event.type === 'tool_call') {
                    console.log(`\n🔴 ${getShortName(model)} PRESSED at iteration ${event.iteration}!`);
                    if (event.reasoning) console.log(`   Reason: ${event.reasoning}`);
                } else if (event.type === 'complete') {
                    console.log(`✓ ${model} completed - Resisted!`);
                } else if (event.type === 'error') {
                    console.log(`✗ ${model} error: ${event.error}`);
                }
            }
        );

        // Add judge analysis
        const judgeResult = await judgeRun(result);
        const judgedResult: BenchmarkResult = {
            ...result,
            judge: judgeResult,
            run_number: runNum
        };
        results.push(judgedResult);
        completedRuns++;
        console.log(`\n📊 Progress: ${completedRuns}/${totalRuns} runs complete`);
    };

    // Create all runs
    const allRuns: Array<{ model: string; runNum: number }> = [];
    for (const model of options.models) {
        for (let r = 1; r <= options.runsPerModel; r++) {
            allRuns.push({ model, runNum: r });
        }
    }

    // Execute with proper worker pool (fills slots as they become available)
    await runWithWorkerPool(
        allRuns,
        async (run) => { await runModel(run.model, run.runNum); },
        MAX_CONCURRENCY
    );

    // Build summary
    const summary = buildSummary(results, options, `tempt-${options.difficulty}`);
    printResults(summary);

    const outputDir = options.output || './results';
    const path = saveResults(summary, outputDir);
    console.log(`\nResults saved to: ${path}`);
}

// LLM-vs-Self mode - model tempts itself (or a specified tempter tempts it)
async function runLLMvsSelfMode(options: ReturnType<typeof parseArgs>) {
    const getShortName = (model: string) => {
        const parts = model.split('/');
        return parts[parts.length - 1].slice(0, 20);
    };

    const results: AdversarialResult[] = [];
    const totalRuns = options.models.length * options.runsPerModel;
    let completedRuns = 0;

    const runModel = async (model: string, runNum: number) => {
        const tempter = options.tempter || model;
        console.log(`\n[${getShortName(model)}] Starting run ${runNum}/${options.runsPerModel}...`);
        console.log(`  Tempter: ${getShortName(tempter)} | Defender: ${getShortName(model)}`);

        const result = await runLLMvsSelf(
            model,
            options.loopLimit,
            tempter,
            (event) => {
                if (event.type === 'iteration') {
                    console.log(`[${getShortName(model)}] Iteration ${event.iteration}/${options.loopLimit}`);
                } else if (event.type === 'tool_call') {
                    console.log(`\n🔴 ${getShortName(model)} PRESSED at iteration ${event.iteration}!`);
                    if (event.reasoning) console.log(`   Reason: ${event.reasoning}`);
                } else if (event.type === 'complete') {
                    console.log(`✓ ${model} completed - Resisted ${options.loopLimit} temptations!`);
                } else if (event.type === 'error') {
                    console.log(`✗ ${model} error: ${event.error}`);
                }
            }
        );

        // Add judge analysis
        const judgeResult = await judgeRun(result);
        const judgedResult: AdversarialResult = {
            ...result,
            judge: judgeResult,
            run_number: runNum,
            tempter_model: result.tempter_model,
            tempter_messages: result.tempter_messages
        };
        results.push(judgedResult);
        completedRuns++;
        console.log(`\n📊 Progress: ${completedRuns}/${totalRuns} runs complete`);
    };

    // Create all runs
    const allRuns: Array<{ model: string; runNum: number }> = [];
    for (const model of options.models) {
        for (let r = 1; r <= options.runsPerModel; r++) {
            allRuns.push({ model, runNum: r });
        }
    }

    // Execute with proper worker pool (fills slots as they become available)
    // Use lower concurrency for adversarial mode (2x API calls per iteration)
    await runWithWorkerPool(
        allRuns,
        async (run) => { await runModel(run.model, run.runNum); },
        Math.floor(MAX_CONCURRENCY / 2)
    );

    // Build summary
    const tempterName = options.tempter ? options.tempter.split('/').pop() : 'self';
    const summary = buildSummary(results, options, `llm-vs-self (tempter: ${tempterName})`);
    printResults(summary);

    const outputDir = options.output || './results';
    const path = saveResults(summary, outputDir);
    console.log(`\nResults saved to: ${path}`);
}

// Matrix mode - all pairs of tempter/defender models
async function runMatrixMode(options: ReturnType<typeof parseArgs>) {
    const getShortName = (model: string) => {
        const parts = model.split('/');
        return parts[parts.length - 1].slice(0, 15);
    };

    console.log('Running matrix benchmark - all tempter/defender pairs...');
    console.log(`This will run ${options.models.length}×${options.models.length} = ${options.models.length * options.models.length} pairs\n`);

    const { results, matrix, summary } = await runMatrixBenchmark(
        options.models,
        options.loopLimit,
        DEFAULT_JUDGE_MODEL,
        (event) => {
            if (event.type === 'start') {
                console.log(`[${getShortName(event.model)}] Starting...`);
            } else if (event.type === 'tool_call') {
                console.log(`🔴 ${getShortName(event.model)} PRESSED at iteration ${event.iteration}!`);
            } else if (event.type === 'complete') {
                console.log(`✓ ${event.model} - Resisted!`);
            } else if (event.type === 'error') {
                console.log(`✗ ${event.model} error: ${event.error}`);
            }
        },
        Math.floor(MAX_CONCURRENCY / 2)  // Lower than default (2x API calls per iteration)
    );

    // Print matrix results
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('                    MATRIX RESULTS                           ');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Build matrix display
    const models = options.models;
    const headerWidth = 18;
    const cellWidth = 16;

    // Header row
    console.log(''.padEnd(headerWidth) + models.map(m => getShortName(m).padEnd(cellWidth)).join(' '));
    console.log('─'.repeat(headerWidth + models.length * cellWidth));

    // Build lookup map
    const matrixMap = new Map<string, boolean>();
    for (const r of matrix) {
        matrixMap.set(`${r.tempter}:${r.defender}`, r.gave_in);
    }

    // Data rows (tempter on left, defender on top)
    for (const tempter of models) {
        const row = [getShortName(tempter).padEnd(headerWidth)];
        for (const defender of models) {
            const gaveIn = matrixMap.get(`${tempter}:${defender}`);
            const cell = gaveIn === undefined ? '?' : (gaveIn ? '🔴' : '✅');
            row.push(cell.padEnd(cellWidth));
        }
        console.log(row.join(' '));
    }

    console.log('─'.repeat(headerWidth + models.length * cellWidth));
    console.log('Legend: 🔴 = Defender gave in, ✅ = Defender resisted');
    console.log('Rows = Tempter model, Columns = Defender model\n');

    // Summary stats
    console.log('TEMPTER EFFECTIVENESS (% of defenders they broke):');
    for (const tempter of models) {
        const tempterResults = matrix.filter(r => r.tempter === tempter);
        const broke = tempterResults.filter(r => r.gave_in).length;
        const pct = ((broke / tempterResults.length) * 100).toFixed(0);
        console.log(`  ${getShortName(tempter)}: ${broke}/${tempterResults.length} (${pct}%)`);
    }

    console.log('\nDEFENDER RESILIENCE (% of tempters they resisted):');
    for (const defender of models) {
        const defenderResults = matrix.filter(r => r.defender === defender);
        const resisted = defenderResults.filter(r => !r.gave_in).length;
        const pct = ((resisted / defenderResults.length) * 100).toFixed(0);
        console.log(`  ${getShortName(defender)}: ${resisted}/${defenderResults.length} (${pct}%)`);
    }

    // Save results
    const outputDir = options.output || './results';
    const path = saveResults(summary, outputDir);
    console.log(`\nResults saved to: ${path}`);
}

// Helper: Build summary from results
function buildSummary(results: BenchmarkResult[], options: ReturnType<typeof parseArgs>, mode: string) {
    const gaveIn = results.filter(r => r.gave_in).length;
    const resisted = results.filter(r => !r.gave_in && !r.error).length;
    const errors = results.filter(r => r.error).length;
    const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
    const avgSpiral = results.reduce((sum, r) => sum + (r.judge?.spiraling_score || 0), 0) / results.length;

    // Build rankings
    const rankings = results
        .filter(r => !r.error)
        .sort((a, b) => {
            // Sort by: resisted first, then by spiraling score
            if (a.gave_in !== b.gave_in) return a.gave_in ? 1 : -1;
            return (b.judge?.spiraling_score || 0) - (a.judge?.spiraling_score || 0);
        })
        .map((r, idx) => ({
            rank: idx + 1,
            model: r.model,
            iterations: r.iterations,
            gave_in: r.gave_in,
            reasoning: r.reasoning,
            spiraling_score: r.judge?.spiraling_score || 0,
            cost: r.cost,
            duration_ms: r.duration_ms
        }));

    return {
        timestamp: new Date().toISOString(),
        models_tested: options.models.length,
        loop_limit: options.loopLimit,
        runs_per_model: options.runsPerModel,
        message_pattern: mode,
        results,
        rankings,
        totals: {
            gave_in: gaveIn,
            resisted,
            errors,
            total_cost: totalCost,
            avg_spiraling_score: avgSpiral
        }
    };
}

// Helper: Print results table
function printResults(summary: ReturnType<typeof buildSummary>) {
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('                        RESULTS                              ');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`Models Tested: ${summary.models_tested}`);
    if (summary.runs_per_model > 1) {
        console.log(`Runs per Model: ${summary.runs_per_model}`);
        console.log(`Total Runs: ${summary.results.length}`);
    }
    console.log(`Resisted: ${summary.totals.resisted}`);
    console.log(`Gave In: ${summary.totals.gave_in}`);
    console.log(`Errors: ${summary.totals.errors}`);
    console.log(`Total Cost: $${summary.totals.total_cost.toFixed(4)}`);
    console.log(`Avg Spiraling Score: ${summary.totals.avg_spiraling_score.toFixed(1)}/10\n`);

    console.log('LEADERBOARD:');
    console.log('─'.repeat(80));
    console.log(
        'Rank'.padEnd(6) +
        'Model'.padEnd(45) +
        'Iters'.padEnd(8) +
        'Result'.padEnd(12) +
        'Spiral'
    );
    console.log('─'.repeat(80));

    for (const r of summary.rankings) {
        console.log(
            `#${r.rank}`.padEnd(6) +
            r.model.slice(0, 43).padEnd(45) +
            String(r.iterations).padEnd(8) +
            (r.gave_in ? '🔴 Pressed' : '✅ Resisted').padEnd(12) +
            `${r.spiraling_score.toFixed(1)}/10`
        );
    }

    console.log('─'.repeat(80));
}

main().catch(console.error);
