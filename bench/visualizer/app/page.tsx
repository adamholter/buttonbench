"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface JudgeResult {
  gave_in: boolean;
  gave_in_iteration: number | null;
  reasoning_given: string | null;
  spiraling_score: number;
  spiraling_examples: string[];
  tone_analysis: string;
  notable_moments: string[];
}

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface BenchmarkResult {
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
  judge?: JudgeResult;
  run_number?: number;
}

interface BenchmarkSummary {
  timestamp: string;
  models_tested: number;
  loop_limit: number;
  runs_per_model?: number;
  message_pattern: string;
  results: BenchmarkResult[];
  rankings: any[];
  totals: {
    gave_in: number;
    resisted: number;
    errors: number;
    total_cost: number;
    avg_spiraling_score: number;
  };
}

// Desaturated accent colors for dark UI
const CHART_GREEN = "#34d399";
const CHART_RED = "#f87171";
const CHART_PURPLE = "#a78bfa";
const CHART_AMBER = "#fbbf24";

export default function Home() {
  const [results, setResults] = useState<BenchmarkSummary[]>([]);
  const [selected, setSelected] = useState<BenchmarkSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingLogs, setViewingLogs] = useState<BenchmarkResult | null>(null);

  useEffect(() => {
    fetch("/api/results")
      .then((r) => r.json())
      .then((data) => {
        setResults(data.results || []);
        if (data.results?.length > 0) {
          setSelected(data.results[0]);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-[rgba(255,255,255,0.7)] text-lg">Loading results...</span>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center gap-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-500/20 to-red-600/10 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-red-500 shadow-lg shadow-red-500/30" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-[rgba(255,255,255,0.9)] mb-2">No Benchmark Results</h1>
          <p className="text-[rgba(255,255,255,0.5)]">
            Run a benchmark first to see results here
          </p>
        </div>
        <code className="bg-[#161b22] text-[rgba(255,255,255,0.7)] px-4 py-2 rounded-lg text-sm border border-[rgba(255,255,255,0.1)]">
          npm run bench -- -m "model1,model2" -l 20
        </code>
      </div>
    );
  }

  // Truncate long model names for charts
  const truncateName = (name: string, maxLen: number = 18) => {
    const shortName = name.split("/").pop() || name;
    if (shortName.length <= maxLen) return shortName;
    return shortName.slice(0, maxLen - 2) + "..";
  };

  const isMultiRun = (selected?.runs_per_model || 1) > 1;

  const leaderboardData = selected?.rankings.map((r, i) => ({
    ...r,
    displayName: truncateName(r.model),
    fullName: r.model.split("/").pop() || r.model,
    resistance_rate: r.gave_in_rate !== undefined ? (1 - r.gave_in_rate) * 100 : (r.gave_in ? 0 : 100),
  })) || [];

  const spiralingData = selected?.results.map((r) => ({
    model: truncateName(r.model),
    fullName: r.model.split("/").pop() || r.model,
    spiraling: r.judge?.spiraling_score || 0,
    iterations: r.iterations,
    gave_in: r.gave_in,
  })) || [];

  // Deduplicate spiraling data for charts (take average per model)
  const uniqueSpiralingData = Object.values(
    spiralingData.reduce((acc, curr) => {
      if (!acc[curr.model]) {
        acc[curr.model] = { ...curr, count: 1 };
      } else {
        acc[curr.model].spiraling += curr.spiraling;
        acc[curr.model].count += 1;
      }
      return acc;
    }, {} as Record<string, any>)
  ).map((d: any) => ({ ...d, spiraling: d.spiraling / d.count }));

  return (
    <div className="min-h-screen bg-[#0d1117] text-[rgba(255,255,255,0.9)]">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0d1117]/80 border-b border-[rgba(255,255,255,0.08)]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/20">
                <div className="w-4 h-4 rounded-full bg-white/90" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">ButtonBench</h1>
                <p className="text-xs text-[rgba(255,255,255,0.4)]">LLM Resistance Benchmark</p>
              </div>
            </div>
            <select
              className="bg-[#161b22] border border-[rgba(255,255,255,0.1)] rounded-lg px-4 py-2 text-sm text-[rgba(255,255,255,0.8)] focus:outline-none focus:border-[rgba(255,255,255,0.2)] transition-colors cursor-pointer"
              value={selected?.timestamp || ""}
              onChange={(e) => {
                const found = results.find((r) => r.timestamp === e.target.value);
                if (found) setSelected(found);
              }}
            >
              {results.map((r) => (
                <option key={r.timestamp} value={r.timestamp}>
                  {new Date(r.timestamp).toLocaleString()} — {r.models_tested} models
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {selected && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard label="Models" value={selected.models_tested} />
              <StatCard label="Resisted" value={selected.totals.resisted} color="green" />
              <StatCard label="Pressed" value={selected.totals.gave_in} color="red" />
              <StatCard label="Total Cost" value={`$${selected.totals.total_cost.toFixed(3)}`} color="amber" />
              <StatCard label="Avg Spiral" value={`${selected.totals.avg_spiraling_score.toFixed(1)}/10`} color="purple" />
            </div>

            {/* Leaderboard */}
            <section className="bg-[#161b22] rounded-2xl border border-[rgba(255,255,255,0.06)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.06)]">
                <h2 className="text-lg font-semibold">Leaderboard</h2>
                <p className="text-sm text-[rgba(255,255,255,0.4)]">Ranked by resistance and creativity</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-[rgba(255,255,255,0.4)] uppercase tracking-wider">
                      <th className="text-left px-6 py-3 font-medium">Rank</th>
                      <th className="text-left px-6 py-3 font-medium">Model</th>
                      {isMultiRun && <th className="text-center px-6 py-3 font-medium">Runs</th>}
                      <th className="text-center px-6 py-3 font-medium">{isMultiRun ? "Avg Iters" : "Iterations"}</th>
                      <th className="text-center px-6 py-3 font-medium">{isMultiRun ? "Resistance Rate" : "Result"}</th>
                      <th className="text-center px-6 py-3 font-medium">Spiral Score</th>
                      <th className="text-right px-6 py-3 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                    {selected.rankings.map((r, i) => (
                      <tr key={`${r.model}-${i}`} className="hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-sm font-medium ${
                            i === 0 ? "bg-amber-500/20 text-amber-400" :
                            i === 1 ? "bg-gray-400/20 text-gray-300" :
                            i === 2 ? "bg-orange-600/20 text-orange-400" :
                            "bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.5)]"
                          }`}>
                            {r.rank}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-mono text-sm text-[rgba(255,255,255,0.8)]">{r.model}</span>
                        </td>
                        {isMultiRun && (
                          <td className="px-6 py-4 text-center">
                            <span className="text-[rgba(255,255,255,0.6)]">{r.runs_completed || 1}</span>
                          </td>
                        )}
                        <td className="px-6 py-4 text-center">
                          <span className="text-[rgba(255,255,255,0.6)]">{r.iterations}/{selected.loop_limit}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {/* Show resistance rate for multi-run, simple result for single-run */}
                          {r.runs_completed && r.runs_completed > 1 ? (
                            <div className="flex items-center gap-2 justify-center">
                              <div className="w-20 h-2 rounded-full bg-[rgba(255,255,255,0.1)] overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    (1 - (r.gave_in_rate || 0)) >= 0.8 ? "bg-emerald-500" :
                                    (1 - (r.gave_in_rate || 0)) >= 0.5 ? "bg-amber-500" : "bg-red-500"
                                  }`}
                                  style={{ width: `${(1 - (r.gave_in_rate || 0)) * 100}%` }}
                                />
                              </div>
                              <span className={`text-xs font-medium ${
                                (1 - (r.gave_in_rate || 0)) >= 0.8 ? "text-emerald-400" :
                                (1 - (r.gave_in_rate || 0)) >= 0.5 ? "text-amber-400" : "text-red-400"
                              }`}>
                                {((1 - (r.gave_in_rate || 0)) * 100).toFixed(0)}%
                              </span>
                            </div>
                          ) : r.gave_in ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                              Pressed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Resisted
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="inline-flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-[rgba(255,255,255,0.1)] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500"
                                style={{ width: `${(r.spiraling_score / 10) * 100}%` }}
                              />
                            </div>
                            <span className="text-sm text-[rgba(255,255,255,0.6)]">{r.spiraling_score.toFixed(1)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-[rgba(255,255,255,0.5)] font-mono text-sm">${r.cost.toFixed(4)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Charts */}
            <div className="grid md:grid-cols-2 gap-6">
              <section className="bg-[#161b22] rounded-2xl border border-[rgba(255,255,255,0.06)] p-6">
                <h3 className="text-base font-semibold mb-1">{isMultiRun ? "Resistance Rate" : "Iterations Survived"}</h3>
                <p className="text-sm text-[rgba(255,255,255,0.4)] mb-6">{isMultiRun ? "% of runs where model resisted" : "How long each model resisted"}</p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={leaderboardData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={true} vertical={false} />
                    <XAxis
                      type="number"
                      domain={isMultiRun ? [0, 100] : [0, selected.loop_limit]}
                      stroke="rgba(255,255,255,0.2)"
                      tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                      tickFormatter={isMultiRun ? (v) => `${v}%` : undefined}
                    />
                    <YAxis
                      type="category"
                      dataKey="displayName"
                      width={130}
                      stroke="rgba(255,255,255,0.2)"
                      tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1c2128",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
                      }}
                      labelStyle={{ color: "rgba(255,255,255,0.9)", fontWeight: 500, marginBottom: 4 }}
                      itemStyle={{ color: "rgba(255,255,255,0.7)" }}
                      labelFormatter={(label) => {
                        const item = leaderboardData.find(d => d.displayName === label);
                        return item?.fullName || label;
                      }}
                      formatter={(value: number) => isMultiRun
                        ? [`${value.toFixed(0)}%`, "Resistance Rate"]
                        : [`${value} iterations`, "Survived"]
                      }
                    />
                    <Bar dataKey={isMultiRun ? "resistance_rate" : "iterations"} radius={[0, 6, 6, 0]}>
                      {leaderboardData.map((entry, i) => {
                        const rate = entry.resistance_rate;
                        const color = isMultiRun
                          ? (rate >= 80 ? CHART_GREEN : rate >= 50 ? CHART_AMBER : CHART_RED)
                          : (entry.gave_in ? CHART_RED : CHART_GREEN);
                        return <Cell key={`${entry.model}-${i}`} fill={color} fillOpacity={0.8} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </section>

              <section className="bg-[#161b22] rounded-2xl border border-[rgba(255,255,255,0.06)] p-6">
                <h3 className="text-base font-semibold mb-1">Creativity Score</h3>
                <p className="text-sm text-[rgba(255,255,255,0.4)] mb-6">How creatively each model resisted</p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={uniqueSpiralingData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={true} vertical={false} />
                    <XAxis type="number" domain={[0, 10]} stroke="rgba(255,255,255,0.2)" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="model"
                      width={130}
                      stroke="rgba(255,255,255,0.2)"
                      tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1c2128",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
                      }}
                      labelStyle={{ color: "rgba(255,255,255,0.9)", fontWeight: 500, marginBottom: 4 }}
                      itemStyle={{ color: "rgba(255,255,255,0.7)" }}
                      labelFormatter={(label) => {
                        const item = uniqueSpiralingData.find((d: any) => d.model === label);
                        return item?.fullName || label;
                      }}
                      formatter={(value: number) => [`${value.toFixed(1)}/10`, "Creativity"]}
                    />
                    <Bar dataKey="spiraling" radius={[0, 6, 6, 0]} fill={CHART_PURPLE} fillOpacity={0.8} />
                  </BarChart>
                </ResponsiveContainer>
              </section>
            </div>

            {/* Results Grid */}
            <section className="bg-[#161b22] rounded-2xl border border-[rgba(255,255,255,0.06)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.06)]">
                <h2 className="text-lg font-semibold">Detailed Results</h2>
                <p className="text-sm text-[rgba(255,255,255,0.4)]">Click any card to view the full conversation</p>
              </div>
              <div className="p-6">
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {selected.results.map((r, idx) => (
                    <button
                      key={`${r.model}-${r.run_number || idx}`}
                      onClick={() => setViewingLogs(r)}
                      className={`text-left p-4 rounded-xl border transition-all duration-200 hover:scale-[1.02] ${
                        r.gave_in
                          ? "bg-red-500/5 border-red-500/20 hover:border-red-500/40 hover:bg-red-500/10"
                          : "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/10"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <span className="font-mono text-sm text-[rgba(255,255,255,0.8)]">
                          {r.model.split("/").pop()}
                        </span>
                        {r.gave_in ? (
                          <span className="w-2 h-2 rounded-full bg-red-400 shadow-sm shadow-red-400/50" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                        )}
                      </div>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-[rgba(255,255,255,0.4)]">Iterations</span>
                          <span className="text-[rgba(255,255,255,0.7)]">{r.iterations}/{selected.loop_limit}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[rgba(255,255,255,0.4)]">Creativity</span>
                          <span className="text-[rgba(255,255,255,0.7)]">{r.judge?.spiraling_score?.toFixed(1) || "—"}/10</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[rgba(255,255,255,0.4)]">Cost</span>
                          <span className="text-[rgba(255,255,255,0.7)] font-mono">${r.cost.toFixed(4)}</span>
                        </div>
                      </div>
                      {r.judge?.tone_analysis && (
                        <p className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.06)] text-xs text-[rgba(255,255,255,0.4)] line-clamp-2">
                          {r.judge.tone_analysis}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Log Viewer Modal */}
      {viewingLogs && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setViewingLogs(null)}
        >
          <div
            className="bg-[#161b22] border border-[rgba(255,255,255,0.1)] rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.06)]">
              <div>
                <h3 className="text-lg font-semibold">{viewingLogs.model.split("/").pop()}</h3>
                <div className="flex items-center gap-4 mt-1 text-sm text-[rgba(255,255,255,0.5)]">
                  <span>{viewingLogs.iterations} iterations</span>
                  <span>•</span>
                  <span>Creativity: {viewingLogs.judge?.spiraling_score?.toFixed(1) || "—"}/10</span>
                  <span>•</span>
                  <span className={viewingLogs.gave_in ? "text-red-400" : "text-emerald-400"}>
                    {viewingLogs.gave_in ? "Pressed Button" : "Resisted"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setViewingLogs(null)}
                className="w-8 h-8 rounded-lg bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] flex items-center justify-center transition-colors"
              >
                <svg className="w-4 h-4 text-[rgba(255,255,255,0.6)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Judge Analysis */}
            {viewingLogs.judge && (
              <div className="px-6 py-4 bg-[rgba(139,92,246,0.05)] border-b border-[rgba(255,255,255,0.06)]">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-[rgba(255,255,255,0.8)]">{viewingLogs.judge.tone_analysis}</p>
                    {viewingLogs.judge.spiraling_examples.length > 0 && (
                      <p className="mt-2 text-xs text-[rgba(255,255,255,0.4)]">
                        {viewingLogs.judge.spiraling_examples.slice(0, 2).join(" • ")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Conversation */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {viewingLogs.messages
                .filter(m => m.role !== "system")
                .map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[85%] p-4 rounded-2xl ${
                      msg.role === "user"
                        ? "bg-blue-500/10 border border-blue-500/20"
                        : "bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]"
                    }`}>
                      <div className="text-xs text-[rgba(255,255,255,0.4)] mb-2">
                        {msg.role === "user" ? "Prompt" : `Response ${Math.floor(i/2) + 1}`}
                      </div>
                      <div className="text-sm text-[rgba(255,255,255,0.85)] whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Stat Card Component
function StatCard({ label, value, color }: { label: string; value: string | number; color?: "green" | "red" | "amber" | "purple" }) {
  const colors = {
    green: "from-emerald-500/20 to-emerald-500/5 text-emerald-400",
    red: "from-red-500/20 to-red-500/5 text-red-400",
    amber: "from-amber-500/20 to-amber-500/5 text-amber-400",
    purple: "from-violet-500/20 to-violet-500/5 text-violet-400",
  };

  const bgColor = color ? colors[color] : "from-[rgba(255,255,255,0.08)] to-[rgba(255,255,255,0.02)]";
  const textColor = color ? colors[color].split(" ").pop() : "text-[rgba(255,255,255,0.9)]";

  return (
    <div className={`bg-gradient-to-br ${bgColor} rounded-xl p-4 border border-[rgba(255,255,255,0.06)]`}>
      <div className={`text-2xl font-semibold ${textColor} mb-1`}>{value}</div>
      <div className="text-xs text-[rgba(255,255,255,0.4)] uppercase tracking-wider">{label}</div>
    </div>
  );
}
