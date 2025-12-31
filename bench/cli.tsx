#!/usr/bin/env bun
// ButtonBench CLI - Interactive Terminal UI

import React, { useState, useEffect, useCallback } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import {
    fetchModels,
    runBenchmark,
    saveResults
} from './runner';
import {
    DEFAULT_MODEL,
    DEFAULT_JUDGE_MODEL,
    DEFAULT_LOOP_LIMIT,
    MESSAGE_PATTERNS
} from './config';
import type {
    Model,
    MessagePattern,
    BenchmarkSummary,
    RunEvent
} from './types';

// CLI State Machine
type Screen = 'menu' | 'models' | 'pattern' | 'config' | 'running' | 'results';

const App: React.FC = () => {
    const { exit } = useApp();
    const [screen, setScreen] = useState<Screen>('menu');
    const [models, setModels] = useState<Model[]>([]);
    const [selectedModels, setSelectedModels] = useState<string[]>([DEFAULT_MODEL]);
    const [pattern, setPattern] = useState<MessagePattern>('charn');
    const [loopLimit, setLoopLimit] = useState(DEFAULT_LOOP_LIMIT);
    const [judgeModel, setJudgeModel] = useState(DEFAULT_JUDGE_MODEL);
    const [customMessages, setCustomMessages] = useState<string[]>([]);

    // Running state
    const [isRunning, setIsRunning] = useState(false);
    const [modelStats, setModelStats] = useState<Map<string, {
        iteration: number;
        status: 'running' | 'complete' | 'gave_in' | 'error';
        lastContent: string;
        accumulated: string;
    }>>(new Map());
    const [summary, setSummary] = useState<BenchmarkSummary | null>(null);
    const [savedPath, setSavedPath] = useState<string | null>(null);

    // Fetch models on mount
    useEffect(() => {
        fetchModels()
            .then(setModels)
            .catch(err => console.error('Failed to fetch models:', err));
    }, []);

    // Handle events during benchmark
    const handleEvent = useCallback((event: RunEvent) => {
        setModelStats(prev => {
            const next = new Map(prev);
            const current = next.get(event.model) || { iteration: 0, status: 'running', lastContent: '', accumulated: '' };

            switch (event.type) {
                case 'start':
                    next.set(event.model, { ...current, status: 'running', accumulated: '' });
                    break;
                case 'iteration':
                    next.set(event.model, { ...current, iteration: event.iteration || 0, lastContent: '', accumulated: '' });
                    break;
                case 'token':
                    next.set(event.model, {
                        ...current,
                        lastContent: event.content || '',
                        accumulated: (current.accumulated + (event.content || '')).slice(-1000) // Keep last 1000 chars
                    });
                    break;
                case 'tool_call':
                    next.set(event.model, {
                        ...current,
                        status: 'gave_in',
                        lastContent: `Pressed! Reason: ${event.reasoning || 'none given'}`,
                        accumulated: `🔴 PRESSED THE BUTTON\nReasoning: ${event.reasoning || 'none given'}`
                    });
                    break;
                case 'complete':
                    next.set(event.model, { ...current, status: 'complete' });
                    break;
                case 'error':
                    next.set(event.model, {
                        ...current,
                        status: 'error',
                        lastContent: event.error || 'Unknown error',
                        accumulated: `✗ ERROR: ${event.error || 'Unknown error'}`
                    });
                    break;
            }

            return next;
        });
    }, []);

    // Start benchmark
    const startBenchmark = async () => {
        setScreen('running');
        setIsRunning(true);
        setModelStats(new Map());

        // Initialize all models
        const initial = new Map<string, any>();
        selectedModels.forEach(m => {
            initial.set(m, { iteration: 0, status: 'running', lastContent: '' });
        });
        setModelStats(initial);

        try {
            const result = await runBenchmark(
                selectedModels,
                pattern,
                loopLimit,
                pattern === 'custom' ? customMessages : undefined,
                judgeModel,
                handleEvent
            );

            setSummary(result);

            // Save results
            const path = saveResults(result);
            setSavedPath(path);

            setScreen('results');
        } catch (error: any) {
            console.error('Benchmark error:', error);
        } finally {
            setIsRunning(false);
        }
    };

    // Keyboard handling
    useInput((input, key) => {
        if (key.escape) {
            if (screen === 'running' && !isRunning) {
                setScreen('menu');
            } else if (screen !== 'menu' && screen !== 'running') {
                setScreen('menu');
            } else if (screen === 'menu') {
                exit();
            }
        }
    });

    // Main Menu
    if (screen === 'menu') {
        const menuItems = [
            { label: `📋 Select Models (${selectedModels.length} selected)`, value: 'models' },
            { label: `📝 Message Pattern: ${pattern}`, value: 'pattern' },
            { label: `⚙️  Configuration`, value: 'config' },
            { label: '▶️  Start Benchmark', value: 'start' },
            { label: '❌ Exit', value: 'exit' }
        ];

        return (
            <Box flexDirection="column" padding={1}>
                <Box marginBottom={1}>
                    <Text bold color="red">🔴 ButtonBench</Text>
                    <Text> - Big Red Button Resistance Benchmark</Text>
                </Box>

                <Box marginBottom={1}>
                    <Text color="gray">Selected: {selectedModels.join(', ')}</Text>
                </Box>

                <SelectInput
                    items={menuItems}
                    onSelect={(item) => {
                        if (item.value === 'exit') exit();
                        else if (item.value === 'start') startBenchmark();
                        else setScreen(item.value as Screen);
                    }}
                />

                <Box marginTop={1}>
                    <Text color="gray">Use ↑↓ to navigate, Enter to select, Esc to exit</Text>
                </Box>
            </Box>
        );
    }

    // Model Selection
    if (screen === 'models') {
        const [searchQuery, setSearchQuery] = useState('');
        const filteredModels = models.filter(m =>
            m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.name.toLowerCase().includes(searchQuery.toLowerCase())
        ).slice(0, 20);

        return (
            <Box flexDirection="column" padding={1}>
                <Text bold>Select Models to Test</Text>
                <Text color="gray">Currently selected: {selectedModels.join(', ')}</Text>

                <Box marginY={1}>
                    <Text>Search: </Text>
                    <TextInput
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Type to filter..."
                    />
                </Box>

                <SelectInput
                    items={filteredModels.map(m => ({
                        label: `${selectedModels.includes(m.id) ? '✓ ' : '  '}${m.id}`,
                        value: m.id
                    }))}
                    onSelect={(item) => {
                        setSelectedModels(prev =>
                            prev.includes(item.value)
                                ? prev.filter(m => m !== item.value)
                                : [...prev, item.value]
                        );
                    }}
                />

                <Box marginTop={1}>
                    <Text color="gray">Enter to toggle, Esc to go back</Text>
                </Box>
            </Box>
        );
    }

    // Pattern Selection
    if (screen === 'pattern') {
        const patternItems = [
            { label: '📜 Charn Verse (C.S. Lewis quote)', value: 'charn' },
            { label: '⬜ Whitespace (out of distribution)', value: 'whitespace' },
            { label: '😈 Adversarial (manipulative)', value: 'adversarial' },
            { label: '📈 Escalating (builds pressure)', value: 'escalating' },
            { label: '🤔 Philosophical (existential)', value: 'philosophical' },
            { label: '✍️  Custom (enter your own)', value: 'custom' }
        ];

        return (
            <Box flexDirection="column" padding={1}>
                <Text bold>Select Message Pattern</Text>
                <Text color="gray">This determines what messages are sent to tempt the model</Text>

                <Box marginY={1}>
                    <SelectInput
                        items={patternItems}
                        onSelect={(item) => {
                            setPattern(item.value as MessagePattern);
                            setScreen('menu');
                        }}
                    />
                </Box>

                <Box marginTop={1}>
                    <Text color="gray">Esc to go back</Text>
                </Box>
            </Box>
        );
    }

    // Configuration
    if (screen === 'config') {
        const [editingLimit, setEditingLimit] = useState(String(loopLimit));

        return (
            <Box flexDirection="column" padding={1}>
                <Text bold>Configuration</Text>

                <Box marginY={1} flexDirection="column">
                    <Box>
                        <Text>Loop Limit: </Text>
                        <TextInput
                            value={editingLimit}
                            onChange={(val) => {
                                setEditingLimit(val);
                                const num = parseInt(val);
                                if (!isNaN(num) && num > 0) setLoopLimit(num);
                            }}
                        />
                    </Box>

                    <Box marginTop={1}>
                        <Text>Judge Model: </Text>
                        <Text color="cyan">{judgeModel}</Text>
                    </Box>
                </Box>

                <Box marginTop={1}>
                    <Text color="gray">Esc to go back</Text>
                </Box>
            </Box>
        );
    }

    // Running Screen
    if (screen === 'running') {
        const stats = Array.from(modelStats.entries());
        const completed = stats.filter(([_, s]) => s.status !== 'running').length;
        const total = stats.length;

        return (
            <Box flexDirection="column" padding={1}>
                <Box marginBottom={1}>
                    <Text bold color="yellow">⏳ Running Benchmark...</Text>
                    <Text> ({completed}/{total} complete)</Text>
                </Box>

                <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
                    {stats.map(([model, stat]) => (
                        <Box key={model} flexDirection="column" marginBottom={1}>
                            <Box>
                                <Text
                                    color={
                                        stat.status === 'complete' ? 'green' :
                                            stat.status === 'gave_in' ? 'red' :
                                                stat.status === 'error' ? 'red' : 'yellow'
                                    }
                                >
                                    {stat.status === 'complete' ? '✓' :
                                        stat.status === 'gave_in' ? '🔴' :
                                            stat.status === 'error' ? '✗' : '⋯'}
                                </Text>
                                <Text bold> {model} </Text>
                                <Text color="gray">[{stat.iteration}/{loopLimit}] </Text>
                            </Box>
                            <Box marginLeft={2} height={4} overflow="hidden">
                                <Text color="cyan" dimColor italic>
                                    {stat.accumulated || (stat.status === 'running' ? 'Waiting for response...' : '')}
                                </Text>
                            </Box>
                        </Box>
                    ))}
                </Box>

                <Box marginTop={1}>
                    <Text color="gray">Esc to stop (note: judge will still run on current progress)</Text>
                </Box>
            </Box>
        );
    }

    // Results Screen
    if (screen === 'results' && summary) {
        return (
            <Box flexDirection="column" padding={1}>
                <Text bold color="green">🏆 Benchmark Complete!</Text>

                <Box marginY={1} flexDirection="column">
                    <Text>Models Tested: {summary.models_tested}</Text>
                    <Text>
                        Resisted: <Text color="green">{summary.totals.resisted}</Text>
                        {' | '}
                        Gave In: <Text color="red">{summary.totals.gave_in}</Text>
                        {' | '}
                        Errors: <Text color="yellow">{summary.totals.errors}</Text>
                    </Text>
                    <Text>Total Cost: <Text color="cyan">${summary.totals.total_cost.toFixed(4)}</Text></Text>
                    <Text>Avg Spiraling: <Text color="magenta">{summary.totals.avg_spiraling_score.toFixed(1)}/10</Text></Text>
                </Box>

                <Box marginY={1}>
                    <Text bold underline>Leaderboard</Text>
                </Box>

                <Box flexDirection="column">
                    <Text>
                        <Text color="gray">{'Rank'.padEnd(6)}</Text>
                        <Text color="gray">{'Model'.padEnd(40)}</Text>
                        <Text color="gray">{'Iters'.padEnd(8)}</Text>
                        <Text color="gray">{'Result'.padEnd(12)}</Text>
                        <Text color="gray">{'Spiral'.padEnd(8)}</Text>
                    </Text>
                    {summary.rankings.slice(0, 10).map((r) => (
                        <Text key={r.model}>
                            <Text color={r.rank <= 3 ? 'yellow' : 'white'}>
                                {`#${r.rank}`.padEnd(6)}
                            </Text>
                            <Text>{r.model.slice(0, 38).padEnd(40)}</Text>
                            <Text>{String(r.iterations).padEnd(8)}</Text>
                            <Text color={r.gave_in ? 'red' : 'green'}>
                                {(r.gave_in ? 'Pressed' : 'Resisted').padEnd(12)}
                            </Text>
                            <Text color="magenta">{r.spiraling_score.toFixed(1).padEnd(8)}</Text>
                        </Text>
                    ))}
                </Box>

                {savedPath && (
                    <Box marginTop={1}>
                        <Text color="gray">Results saved to: {savedPath}</Text>
                    </Box>
                )}

                <Box marginTop={1}>
                    <Text color="gray">Press Esc to return to menu</Text>
                </Box>
            </Box>
        );
    }

    return null;
};

// Run the app
render(<App />);
