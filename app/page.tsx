"use client";

import { useState, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const TRACKS = [
  { name: "大井", code: "44" },
  { name: "川崎", code: "45" },
  { name: "船橋", code: "43" },
  { name: "浦和", code: "42" },
  { name: "門別", code: "30" },
  { name: "盛岡", code: "35" },
  { name: "水沢", code: "36" },
  { name: "金沢", code: "46" },
  { name: "笠松", code: "47" },
  { name: "名古屋", code: "48" },
  { name: "園田", code: "50" },
  { name: "姫路", code: "51" },
  { name: "高知", code: "54" },
  { name: "佐賀", code: "55" },
];

interface Prediction {
  rank: number;
  number: number;
  name: string;
  jockey: string;
  prob: number;
  winRate: number;
  showRate: number;
  odds: number;
  placeOdds: number;
  placeOddsMin: number;
  placeOddsMax: number;
  expectedValue: number;
  isValue: boolean;
  betLayer: "roi_buy" | "watch" | null;  // 回収率ベース買い目
  recommendedBet: number;              // 推奨賭け金
}

interface RaceResult {
  rank: number;
  number: number;
}

interface Race {
  id: string;
  name: string;
  distance: number;
  time: string;
  predictions: Prediction[];
  result?: RaceResult[] | null;
}

interface RaceWithLoading extends Race {
  isLoading?: boolean;
}

interface ModelInfo {
  track_name: string;
  trained_at: string;
  data_count: number;
  race_count: number;
  date_range: {
    from: string;
    to: string;
  };
  auc: number;
}

interface DailyStats {
  finishedRaces: number;
  winHits: number;
  showHits: number;
  totalBet: number;
  totalPayout: number;
  winRate: number;
  showRate: number;
  roi: number;
}

// 買い目の型定義
interface BetRecommendation {
  type: string;
  horses: number[];
  confidence: "高" | "中" | "低";
  reason: string;
}

// 分析結果の型定義
interface AnalysisResult {
  date: string;
  summary: {
    total_races: number;
    win_hits: number;
    win_rate: number;
    show_hits: number;
    show_rate: number;
  };
  by_track_condition: Record<string, { total: number; show_hits: number }>;
  by_weather: Record<string, { total: number; show_hits: number }>;
  by_distance: Record<string, { total: number; show_hits: number }>;
  error_types: Record<string, number>;
}

// おすすめ賭け方を判定（カード用シンプル版）
function getBetRecommendation(predictions: Prediction[]): { type: string; reason: string } {
  if (predictions.length < 2) return { type: "様子見", reason: "データ不足" };

  const prob1 = predictions[0].prob;
  const prob2 = predictions[1].prob;
  const prob3 = predictions[2]?.prob || 0;
  const diff12 = (prob1 - prob2) * 100; // 1位と2位の差（%）
  const diff13 = (prob1 - prob3) * 100; // 1位と3位の差（%）

  if (prob1 >= 0.5 && diff12 >= 15) {
    return { type: "単勝", reason: "本命が強い" };
  } else if (diff13 <= 20) {
    return { type: "複勝", reason: "混戦" };
  } else {
    return { type: "複勝", reason: "安定狙い" };
  }
}

// 詳細な買い目推奨（モーダル用）
function getDetailedBetRecommendations(predictions: Prediction[]): BetRecommendation[] {
  if (predictions.length < 3) return [];

  const recs: BetRecommendation[] = [];
  const p1 = predictions[0];
  const p2 = predictions[1];
  const p3 = predictions[2];
  const p4 = predictions[3];

  const prob1 = p1.prob;
  const prob2 = p2.prob;
  const prob3 = p3.prob;
  const prob4 = p4?.prob || 0;

  const diff12 = (prob1 - prob2) * 100;
  const diff23 = (prob2 - prob3) * 100;
  const diff34 = (prob3 - prob4) * 100;
  const top3Sum = (prob1 + prob2 + prob3) * 100;

  // === 単勝 ===
  if (prob1 >= 0.45 && diff12 >= 12) {
    recs.push({
      type: "単勝",
      horses: [p1.number],
      confidence: prob1 >= 0.55 ? "高" : "中",
      reason: `${p1.name}が抜けた存在（${(prob1 * 100).toFixed(0)}%）`,
    });
  }

  // === 複勝 ===
  if (prob1 >= 0.35) {
    recs.push({
      type: "複勝",
      horses: [p1.number],
      confidence: prob1 >= 0.45 ? "高" : "中",
      reason: `${p1.name}の3着内率が高い`,
    });
  }
  // 2位も複勝推奨（混戦時）
  if (prob2 >= 0.30 && diff12 < 15) {
    recs.push({
      type: "複勝",
      horses: [p2.number],
      confidence: "中",
      reason: `${p2.name}も上位争い`,
    });
  }

  // === ワイド ===
  if (top3Sum >= 90 && diff23 < 15) {
    // TOP3が拮抗
    recs.push({
      type: "ワイド",
      horses: [p1.number, p2.number],
      confidence: "高",
      reason: "本命-対抗の堅い組み合わせ",
    });
    if (diff23 < 10) {
      recs.push({
        type: "ワイド",
        horses: [p1.number, p3.number],
        confidence: "中",
        reason: "本命-3番手で手広く",
      });
    }
  }

  // === 馬連 ===
  if (prob1 + prob2 >= 0.65 && diff12 < 20) {
    recs.push({
      type: "馬連",
      horses: [p1.number, p2.number],
      confidence: prob1 + prob2 >= 0.75 ? "高" : "中",
      reason: "上位2頭で決まりやすい",
    });
  }

  // === 馬単 ===
  if (prob1 >= 0.50 && diff12 >= 15 && prob2 >= 0.25) {
    recs.push({
      type: "馬単",
      horses: [p1.number, p2.number],
      confidence: diff12 >= 20 ? "高" : "中",
      reason: `${p1.name}頭固定が有力`,
    });
  }

  // === 三連複 ===
  if (top3Sum >= 100 && diff34 >= 8) {
    recs.push({
      type: "三連複",
      horses: [p1.number, p2.number, p3.number],
      confidence: top3Sum >= 120 ? "高" : "中",
      reason: "上位3頭が堅い",
    });
  } else if (top3Sum >= 85 && diff34 < 8) {
    // 4番手も絡みそう
    recs.push({
      type: "三連複",
      horses: [p1.number, p2.number, p3.number],
      confidence: "中",
      reason: "荒れ注意、4番手も警戒",
    });
  }

  // === 三連単 ===
  if (prob1 >= 0.50 && diff12 >= 15 && prob2 >= 0.25 && diff23 >= 10) {
    recs.push({
      type: "三連単",
      horses: [p1.number, p2.number, p3.number],
      confidence: "中",
      reason: `${p1.name}→${p2.name}→${p3.name}の順`,
    });
  }

  return recs;
}

// 買い目推奨の型定義
interface AutoBet {
  raceId: string;
  raceName: string;
  raceTime: string;
  number: number;
  name: string;
  jockey: string;
  prob: number;
  odds: number;
  placeOddsMin: number;
  placeOddsMax: number;
  placeOddsAvg: number;
  ev: number;
  betAmount: number;
  type: "本命" | "対抗" | "穴";
  isFinished: boolean;
  result?: number; // 着順
}

// 自動買い目を計算（Optuna最適化済みフィルター適用）
// 最適化: scripts/optimize_filters.py → models/optimal_filters.json
function calculateAutoBets(races: RaceWithLoading[]): AutoBet[] {
  const bets: AutoBet[] = [];

  // === Optuna最適化済みフィルター設定 ===
  // テスト期間(2025-10-01〜): 222点, 複勝的中率65.8%
  const MIN_PROB_DIFF = 0.0427;  // 1位と2位の確率差 ≥ 4.27%
  const MIN_PROB = 0.354;        // 最低確率 ≥ 35.4%
  const MIN_RACE_NUMBER = 1;     // 全レース対象
  const MIN_PLACE_ODDS = 1.3;    // 複勝オッズ1.3倍以上

  for (const race of races) {
    if (race.isLoading || race.predictions.length === 0) continue;

    // フィルター1: レース番号
    const raceNum = parseInt(race.id.replace(/\D/g, '')) || 0;
    if (raceNum < MIN_RACE_NUMBER) continue;

    const isFinished = race.result && race.result.length > 0;
    const resultMap = new Map<number, number>();
    if (race.result) {
      race.result.forEach(r => resultMap.set(r.number, r.rank));
    }

    // 予測1位と2位を取得
    const sorted = [...race.predictions].sort((a, b) => b.prob - a.prob);
    if (sorted.length < 2) continue;

    const first = sorted[0];
    const second = sorted[1];
    const probDiff = first.prob - second.prob;

    // フィルター2: 1位と2位の確率差 ≥ 4.27%
    if (probDiff < MIN_PROB_DIFF) continue;

    // フィルター3: 最低確率 ≥ 35.4%
    if (first.prob < MIN_PROB) continue;

    const placeOddsAvg = first.placeOdds || 0;

    // フィルター4: オッズ条件
    if (placeOddsAvg < MIN_PLACE_ODDS) continue;

    // 全条件クリア → 買い目追加
    // 確率差に応じた賭け金（確率差が大きいほど自信度高い）
    const ev = first.expectedValue;
    let betAmount = 200;
    if (probDiff > 0.15) betAmount = 500;      // 15%以上差: 高自信
    else if (probDiff > 0.10) betAmount = 400; // 10%以上差: 中自信
    else if (probDiff > 0.07) betAmount = 300; // 7%以上差: やや自信

    const betType: "本命" | "対抗" | "穴" = "本命";

    bets.push({
      raceId: race.id,
      raceName: race.name || `${race.id}R`,
      raceTime: race.time || "",
      number: first.number,
      name: first.name,
      jockey: first.jockey,
      prob: first.prob * 100,
      odds: first.odds,
      placeOddsMin: first.placeOddsMin,
      placeOddsMax: first.placeOddsMax,
      placeOddsAvg: placeOddsAvg,
      ev: ev,
      betAmount: betAmount,
      type: betType,
      isFinished: !!isFinished,
      result: resultMap.get(first.number),
    });
  }

  // レース順にソート（同じレース内は本命→穴の順、確率高い順）
  return bets.sort((a, b) => {
    const raceA = parseInt(a.raceId.replace(/\D/g, '')) || 0;
    const raceB = parseInt(b.raceId.replace(/\D/g, '')) || 0;
    if (raceA !== raceB) return raceA - raceB;
    // 本命を先に
    if (a.type !== b.type) return a.type === "本命" ? -1 : 1;
    return b.prob - a.prob; // 同じ層内は確率高い順
  });
}

// 成績計算関数
function calculateStats(races: RaceWithLoading[]): DailyStats | null {
  const finishedRaces = races.filter((r) => r.result && r.result.length > 0);
  if (finishedRaces.length === 0) return null;

  let winHits = 0;
  let showHits = 0;
  let totalPayout = 0;

  for (const race of finishedRaces) {
    if (!race.result || race.predictions.length === 0) continue;

    // 予測1位の馬番
    const pred1st = race.predictions[0].number;
    const pred1stOdds = race.predictions[0].odds;

    // 実際の結果
    const actual1st = race.result[0]?.number;
    const actualTop3 = race.result.map((r) => r.number);

    // 単勝的中
    if (pred1st === actual1st) {
      winHits++;
      if (pred1stOdds > 0) {
        totalPayout += pred1stOdds * 100;
      }
    }
    // 複勝的中（単勝以外で3着以内）
    else if (actualTop3.includes(pred1st)) {
      showHits++;
    }
  }

  const totalBet = finishedRaces.length * 100;

  return {
    finishedRaces: finishedRaces.length,
    winHits,
    showHits,
    totalBet,
    totalPayout,
    winRate: finishedRaces.length > 0 ? (winHits / finishedRaces.length) * 100 : 0,
    showRate: finishedRaces.length > 0 ? ((winHits + showHits) / finishedRaces.length) * 100 : 0,
    roi: totalBet > 0 ? (totalPayout / totalBet) * 100 : 0,
  };
}

// モーダルコンポーネント
function RaceModal({
  race,
  onClose,
}: {
  race: RaceWithLoading;
  onClose: () => void;
}) {
  // 馬番 -> 着順のマップを作成
  const resultMap = new Map<number, number>();
  if (race.result) {
    race.result.forEach((r) => {
      resultMap.set(r.number, r.rank);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          background: "#fff",
          borderRadius: "20px",
          boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          className="px-6 py-4 text-white flex items-center justify-between"
          style={{
            background: race.result
              ? "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)"
              : "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)",
          }}
        >
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold">{race.id}R</span>
              <span className="text-white/80">{race.distance}m</span>
              {race.time && !race.result && (
                <span
                  className="px-2 py-1 text-xs font-medium"
                  style={{ background: "rgba(255,255,255,0.2)", borderRadius: "6px" }}
                >
                  {race.time}
                </span>
              )}
              {race.result && (
                <span
                  className="px-2 py-1 text-xs font-medium"
                  style={{ background: "rgba(255,255,255,0.25)", borderRadius: "6px" }}
                >
                  確定
                </span>
              )}
            </div>
            {race.name && (
              <p className="text-sm text-white/90 mt-1">{race.name}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto">
          {/* 凡例 */}
          <div
            className="px-4 py-2 text-xs grid gap-2"
            style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}
          >
            <div className="flex items-center gap-3" style={{ color: "#64748b" }}>
              <span className="w-8 text-center">AI順</span>
              <span className="w-8 text-center">馬番</span>
              <span className="flex-1">馬名</span>
              <span className="w-14 text-center">人気</span>
              <span className="w-28 text-center">オッズ</span>
              <span className="w-12 text-right">期待値</span>
              <span className="w-12 text-right">AI予測</span>
            </div>
          </div>

          {race.predictions.map((pred, index) => {
            // 人気順を計算（オッズが低い順）
            const sortedByOdds = [...race.predictions]
              .filter(p => p.odds > 0)
              .sort((a, b) => a.odds - b.odds);
            const popularity = sortedByOdds.findIndex(p => p.number === pred.number) + 1;

            // 確信度による色分け
            const prob = pred.prob * 100;
            const probColor = prob >= 70 ? "#059669" : prob >= 50 ? "#0d9488" : prob >= 30 ? "#475569" : "#94a3b8";

            return (
              <div
                key={pred.number}
                className="px-4 py-3 transition-colors hover:bg-slate-50"
                style={{
                  borderBottom: index < race.predictions.length - 1 ? "1px solid #f1f5f9" : "none",
                  background: prob >= 70 ? "rgba(5, 150, 105, 0.05)" : pred.isValue ? "rgba(16, 185, 129, 0.03)" : undefined,
                }}
              >
                <div className="flex items-center gap-3">
                  {/* AI順位 */}
                  <div
                    className="w-8 h-8 flex items-center justify-center text-sm font-bold shrink-0"
                    style={{
                      borderRadius: "8px",
                      background:
                        pred.rank === 1
                          ? "linear-gradient(135deg, #fef3c7, #fde68a)"
                          : pred.rank === 2
                          ? "linear-gradient(135deg, #f1f5f9, #e2e8f0)"
                          : pred.rank === 3
                          ? "linear-gradient(135deg, #fed7aa, #fdba74)"
                          : "#f1f5f9",
                      color:
                        pred.rank === 1
                          ? "#92400e"
                          : pred.rank === 2
                          ? "#475569"
                          : pred.rank === 3
                          ? "#9a3412"
                          : "#64748b",
                    }}
                  >
                    {pred.rank}
                  </div>

                  {/* 馬番 */}
                  <div
                    className="w-8 h-8 flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)",
                      boxShadow: "0 2px 4px rgba(13,148,136,0.3)",
                    }}
                  >
                    {pred.number}
                  </div>

                  {/* 馬名 / 騎手 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold" style={{ color: "#1e293b" }}>
                        {pred.name}
                      </p>
                      {resultMap.has(pred.number) && (
                        <span
                          className="px-1.5 py-0.5 text-xs font-bold"
                          style={{
                            background:
                              resultMap.get(pred.number) === 1
                                ? "#fbbf24"
                                : resultMap.get(pred.number) === 2
                                ? "#9ca3af"
                                : resultMap.get(pred.number)! <= 3
                                ? "#f97316"
                                : "#e2e8f0",
                            color: resultMap.get(pred.number)! <= 3 ? "#1e293b" : "#64748b",
                            borderRadius: "4px",
                          }}
                        >
                          {resultMap.get(pred.number)}着
                        </span>
                      )}
                      {pred.isValue && (
                        <span style={{ fontSize: "14px" }}>🔥</span>
                      )}
                      {prob >= 70 && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "#dcfce7", color: "#166534" }}>
                          おすすめ
                        </span>
                      )}
                    </div>
                    <p className="text-sm" style={{ color: "#64748b" }}>
                      {pred.jockey}
                    </p>
                  </div>

                  {/* 人気 */}
                  <div className="w-14 text-center shrink-0">
                    {popularity > 0 && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded font-medium"
                        style={{
                          background: popularity === 1 ? "#fef3c7" : popularity <= 3 ? "#fef9c3" : "#f1f5f9",
                          color: popularity <= 3 ? "#92400e" : "#64748b"
                        }}
                      >
                        {popularity}人気
                      </span>
                    )}
                  </div>

                  {/* オッズ（単勝/複勝） */}
                  <div className="w-28 text-center shrink-0">
                    <div className="flex flex-col items-center gap-0.5">
                      {pred.odds > 0 && (
                        <span className="text-xs" style={{ color: "#64748b" }}>
                          単{pred.odds.toFixed(1)}倍
                        </span>
                      )}
                      {pred.placeOdds > 0 ? (
                        <span
                          className="text-xs font-medium"
                          style={{ color: pred.placeOdds >= 2 ? "#1e40af" : "#64748b" }}
                        >
                          複{pred.placeOddsMin.toFixed(1)}-{pred.placeOddsMax.toFixed(1)}倍
                        </span>
                      ) : pred.odds === 0 && (
                        <span style={{ color: "#cbd5e1" }}>-</span>
                      )}
                    </div>
                  </div>

                  {/* 期待値 */}
                  <div className="w-12 text-right shrink-0">
                    <span
                      className="text-sm font-bold"
                      style={{
                        color: pred.expectedValue >= 1.0 ? "#059669" : pred.expectedValue >= 0.8 ? "#64748b" : "#94a3b8",
                      }}
                    >
                      {pred.expectedValue > 0 ? pred.expectedValue.toFixed(2) : "-"}
                    </span>
                  </div>

                  {/* AI予測 */}
                  <div className="w-12 text-right shrink-0">
                    <span
                      className="text-lg font-bold"
                      style={{ color: probColor, fontFamily: "monospace" }}
                    >
                      {prob.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 買い目推奨セクション */}
        {!race.result && race.predictions.length >= 3 && (() => {
          const bets = getDetailedBetRecommendations(race.predictions);
          if (bets.length === 0) return null;

          return (
            <div
              className="px-6 py-4"
              style={{ background: "#f0fdf4", borderTop: "1px solid #bbf7d0" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span style={{ fontSize: "18px" }}>📊</span>
                <h4 className="font-bold" style={{ color: "#166534" }}>
                  おすすめ買い目
                </h4>
                <span className="text-xs px-2 py-0.5" style={{ background: "#dcfce7", color: "#166534", borderRadius: "4px" }}>
                  AI分析
                </span>
              </div>
              <div className="grid gap-2">
                {bets.map((bet, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 px-3 py-2"
                    style={{
                      background: "#fff",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    {/* 券種 */}
                    <span
                      className="px-2 py-1 text-xs font-bold"
                      style={{
                        background:
                          bet.type === "単勝" ? "#fef3c7" :
                          bet.type === "複勝" ? "#dbeafe" :
                          bet.type === "ワイド" ? "#e0e7ff" :
                          bet.type === "馬連" ? "#fce7f3" :
                          bet.type === "馬単" ? "#fee2e2" :
                          bet.type === "三連複" ? "#d1fae5" :
                          "#fef9c3",
                        color:
                          bet.type === "単勝" ? "#92400e" :
                          bet.type === "複勝" ? "#1e40af" :
                          bet.type === "ワイド" ? "#3730a3" :
                          bet.type === "馬連" ? "#9d174d" :
                          bet.type === "馬単" ? "#b91c1c" :
                          bet.type === "三連複" ? "#065f46" :
                          "#854d0e",
                        borderRadius: "4px",
                        minWidth: "52px",
                        textAlign: "center",
                      }}
                    >
                      {bet.type}
                    </span>

                    {/* 馬番 */}
                    <div className="flex items-center gap-1">
                      {bet.horses.map((num, i) => (
                        <span key={num} className="flex items-center">
                          <span
                            className="w-6 h-6 flex items-center justify-center text-white text-xs font-bold"
                            style={{
                              borderRadius: "50%",
                              background: "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)",
                            }}
                          >
                            {num}
                          </span>
                          {i < bet.horses.length - 1 && (
                            <span className="mx-0.5 text-gray-400">
                              {bet.type === "馬単" || bet.type === "三連単" ? "→" : "-"}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>

                    {/* 信頼度 */}
                    <span
                      className="px-1.5 py-0.5 text-xs font-medium"
                      style={{
                        background: bet.confidence === "高" ? "#dcfce7" : bet.confidence === "中" ? "#fef9c3" : "#f1f5f9",
                        color: bet.confidence === "高" ? "#166534" : bet.confidence === "中" ? "#854d0e" : "#64748b",
                        borderRadius: "4px",
                      }}
                    >
                      {bet.confidence}
                    </span>

                    {/* 理由 */}
                    <span className="flex-1 text-xs" style={{ color: "#64748b" }}>
                      {bet.reason}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs" style={{ color: "#64748b" }}>
                ※ AI予測確率に基づく参考情報です。投資は自己責任で。
              </p>
            </div>
          );
        })()}

        {/* Modal Footer */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}
        >
          <div className="flex items-center gap-4 text-sm" style={{ color: "#64748b" }}>
            <div className="flex items-center gap-1">
              <span style={{ fontSize: "14px" }}>🔥</span>
              <span>= 期待値 &gt; 2.5（厳選）</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 font-medium transition-colors"
            style={{
              background: "#e2e8f0",
              color: "#475569",
              borderRadius: "8px",
            }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [selectedTrack, setSelectedTrack] = useState(TRACKS[0].code);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [isLoading, setIsLoading] = useState(false);
  const [races, setRaces] = useState<RaceWithLoading[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedRace, setSelectedRace] = useState<RaceWithLoading | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);

  // 分析関連のステート
  const [activeTab, setActiveTab] = useState<"predict" | "analyze">("predict");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const currentTrack = TRACKS.find((t) => t.code === selectedTrack);

  // キャッシュ関数
  const getCacheKey = (date: string, track: string) => `keiba_${date}_${track}`;

  const getCache = (date: string, track: string): RaceWithLoading[] | null => {
    try {
      const key = getCacheKey(date, track);
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      const now = Date.now();
      const today = new Date().toISOString().split("T")[0];

      // 当日のデータは5分キャッシュ、過去データは24時間キャッシュ
      const maxAge = date === today ? 5 * 60 * 1000 : 24 * 60 * 60 * 1000;

      if (now - timestamp > maxAge) {
        localStorage.removeItem(key);
        return null;
      }

      return data;
    } catch {
      return null;
    }
  };

  const setCache = (date: string, track: string, data: RaceWithLoading[]) => {
    try {
      const key = getCacheKey(date, track);
      localStorage.setItem(key, JSON.stringify({
        data,
        timestamp: Date.now(),
      }));
    } catch {
      // localStorage full or unavailable
    }
  };

  // 分析実行関数
  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);

    try {
      const response = await fetch(`${API_URL}/api/analyze/${selectedDate}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "分析に失敗しました");
      }

      const data = await response.json();
      setAnalysisResult(data);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "分析に失敗しました");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // レースデータが更新されたらキャッシュに保存
  useEffect(() => {
    if (races.length > 0 && !isLoading && !races.some(r => r.isLoading)) {
      setCache(selectedDate, selectedTrack, races);
    }
  }, [races, isLoading, selectedDate, selectedTrack]);

  // モデル情報を取得
  useEffect(() => {
    const fetchModelInfo = async () => {
      try {
        const response = await fetch(`${API_URL}/api/models/${selectedTrack}`);
        if (response.ok) {
          const data = await response.json();
          setModelInfo(data);
        } else {
          setModelInfo(null);
        }
      } catch {
        setModelInfo(null);
      }
    };
    fetchModelInfo();
  }, [selectedTrack]);

  const handlePredict = async (forceRefresh = false) => {
    setIsLoading(true);
    setError(null);

    // キャッシュチェック（強制更新でなく、かつまだ表示してない場合のみ）
    if (!forceRefresh && races.length === 0) {
      const cached = getCache(selectedDate, selectedTrack);
      if (cached && cached.length > 0) {
        setRaces(cached);
        setIsLoading(false);
        return;
      }
    }

    setRaces([]);

    try {
      // 1. まず事前計算済み予測を取得してみる（高速）
      const precomputedResponse = await fetch(
        `${API_URL}/api/predictions/${selectedDate}/${selectedTrack}`
      );

      if (precomputedResponse.ok) {
        // 事前計算済みデータあり → オッズだけリアルタイム取得
        const precomputed = await precomputedResponse.json();

        // まず予測データを表示（オッズなし）
        const initialRaces: RaceWithLoading[] = precomputed.races.map(
          (race: { id: string; race_id: string; name: string; distance: number; time: string; field_size: number; predictions: { rank: number; number: number; name: string; jockey: string; prob: number; win_rate: number; show_rate: number; bet_layer?: "roi_buy" | "watch" | null; recommended_bet?: number }[] }) => ({
            id: race.id,
            raceId: race.race_id,
            name: race.name || "",
            distance: race.distance,
            time: race.time || "",
            predictions: race.predictions.map((pred) => ({
              rank: pred.rank,
              number: pred.number,
              name: pred.name,
              jockey: pred.jockey,
              prob: pred.prob,
              winRate: pred.win_rate,
              showRate: pred.show_rate,
              odds: 0,
              placeOdds: 0,
              placeOddsMin: 0,
              placeOddsMax: 0,
              expectedValue: 0,
              isValue: false,
              betLayer: pred.bet_layer || null,
              recommendedBet: pred.recommended_bet || 0,
            })),
            isLoading: false,
          })
        );
        setRaces(initialRaces);

        // オッズを並列取得して更新
        for (const race of precomputed.races) {
          try {
            const oddsResponse = await fetch(`${API_URL}/api/odds`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                race_id: race.race_id,
                track_code: selectedTrack,
              }),
            });

            if (oddsResponse.ok) {
              const oddsData = await oddsResponse.json();
              const oddsDict: Record<number, number> = oddsData.odds || {};
              const placeOddsDict: Record<number, { min: number; max: number; avg: number }> = oddsData.place_odds || {};
              const raceResult: RaceResult[] | null = oddsData.result;

              setRaces((prev) =>
                prev.map((r) => {
                  if (r.id !== race.id) return r;
                  return {
                    ...r,
                    result: raceResult,
                    predictions: r.predictions.map((pred) => {
                      const odds = oddsDict[pred.number] || 0;
                      const placeOdds = placeOddsDict[pred.number];
                      const placeOddsAvg = placeOdds?.avg || 0;
                      const placeOddsMin = placeOdds?.min || 0;
                      const placeOddsMax = placeOdds?.max || 0;
                      // 期待値は複勝オッズベース（なければ単勝/3で概算）
                      const expectedValue = placeOddsAvg > 0
                        ? pred.prob * placeOddsAvg
                        : odds > 0 ? pred.prob * (odds / 3) : 0;
                      return {
                        ...pred,
                        odds,
                        placeOdds: placeOddsAvg,
                        placeOddsMin,
                        placeOddsMax,
                        expectedValue,
                        isValue: expectedValue > 2.5,
                      };
                    }),
                  };
                })
              );
            }
          } catch {
            // skip
          }
        }
      } else {
        // 事前計算なし → 従来のリアルタイム予測にフォールバック
        const listResponse = await fetch(`${API_URL}/api/races`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            track_code: selectedTrack,
            date: selectedDate,
          }),
        });

        if (!listResponse.ok) {
          const errorData = await listResponse.json();
          throw new Error(errorData.detail || "取得に失敗しました");
        }

        const listData = await listResponse.json();
        const raceIds: string[] = listData.race_ids;

        if (raceIds.length === 0) {
          setError("レースが見つかりません");
          setIsLoading(false);
          return;
        }

        const placeholders: RaceWithLoading[] = raceIds.map((rid) => ({
          id: rid.slice(-2),
          name: "",
          distance: 0,
          time: "",
          predictions: [],
          isLoading: true,
        }));
        setRaces(placeholders);

        // 順次取得（1レースずつ表示）
        for (const rid of raceIds) {
          try {
            const raceResponse = await fetch(`${API_URL}/api/predict/race`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                race_id: rid,
                track_code: selectedTrack,
              }),
            });

            if (raceResponse.ok) {
              const raceData = await raceResponse.json();

              // 結果も取得（終了したレース用）
              let raceResult: RaceResult[] | null = null;
              try {
                const oddsResponse = await fetch(`${API_URL}/api/odds`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    race_id: rid,
                    track_code: selectedTrack,
                  }),
                });
                if (oddsResponse.ok) {
                  const oddsData = await oddsResponse.json();
                  raceResult = oddsData.result;
                }
              } catch {
                // skip
              }

              const formattedRace: RaceWithLoading = {
                id: raceData.id,
                name: raceData.name || "",
                distance: raceData.distance,
                time: raceData.time || "",
                result: raceResult,
                predictions: raceData.predictions.map(
                  (pred: {
                    rank: number;
                    number: number;
                    name: string;
                    jockey: string;
                    prob: number;
                    win_rate: number;
                    show_rate: number;
                    odds: number;
                    place_odds?: number;
                    place_odds_min?: number;
                    place_odds_max?: number;
                    expected_value: number;
                    is_value: boolean;
                    bet_layer?: "roi_buy" | "watch" | null;
                    recommended_bet?: number;
                  }) => ({
                    rank: pred.rank,
                    number: pred.number,
                    name: pred.name,
                    jockey: pred.jockey,
                    prob: pred.prob,
                    winRate: pred.win_rate,
                    showRate: pred.show_rate,
                    odds: pred.odds,
                    placeOdds: pred.place_odds || 0,
                    placeOddsMin: pred.place_odds_min || 0,
                    placeOddsMax: pred.place_odds_max || 0,
                    expectedValue: pred.expected_value,
                    isValue: pred.is_value,
                    betLayer: pred.bet_layer || null,
                    recommendedBet: pred.recommended_bet || 0,
                  })
                ),
                isLoading: false,
              };

              setRaces((prev) =>
                prev.map((r) => (r.id === formattedRace.id ? formattedRace : r))
              );
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラー");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#e8f5f3" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-40 text-white"
        style={{ background: "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)" }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">地方競馬 AI 予測</h1>
            {/* タブ切替 */}
            <div className="flex gap-1" style={{ background: "rgba(255,255,255,0.1)", borderRadius: "8px", padding: "2px" }}>
              <button
                onClick={() => setActiveTab("predict")}
                className="px-3 py-1.5 text-sm font-medium transition-all"
                style={{
                  background: activeTab === "predict" ? "#fff" : "transparent",
                  color: activeTab === "predict" ? "#0d9488" : "rgba(255,255,255,0.8)",
                  borderRadius: "6px",
                }}
              >
                予測
              </button>
              <button
                onClick={() => setActiveTab("analyze")}
                className="px-3 py-1.5 text-sm font-medium transition-all"
                style={{
                  background: activeTab === "analyze" ? "#fff" : "transparent",
                  color: activeTab === "analyze" ? "#0d9488" : "rgba(255,255,255,0.8)",
                  borderRadius: "6px",
                }}
              >
                分析
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 pb-24 md:pb-6">
        {/* 予測タブ */}
        {activeTab === "predict" && (
          <>
        {/* Form Card */}
        <div
          className="mb-6 overflow-hidden"
          style={{
            background: "#fff",
            borderRadius: "16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <div
            className="px-5 py-4 text-white flex items-center gap-3"
            style={{ background: "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)" }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <div>
              <h3 className="font-semibold">レース予測</h3>
              <p className="text-sm opacity-90">日付と競馬場を選択してください</p>
            </div>
          </div>

          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "#475569" }}>
                  日付
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-4 py-3 text-base outline-none transition-all"
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    background: "#fff",
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "#475569" }}>
                  競馬場
                </label>
                <select
                  value={selectedTrack}
                  onChange={(e) => setSelectedTrack(e.target.value)}
                  className="w-full px-4 py-3 text-base outline-none transition-all cursor-pointer"
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    background: "#fff",
                  }}
                >
                  {TRACKS.map((track) => (
                    <option key={track.code} value={track.code}>
                      {track.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => handlePredict(true)}
                  disabled={isLoading}
                  className="w-full md:w-auto px-6 py-3 text-white font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                  style={{
                    background: "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)",
                    borderRadius: "12px",
                    boxShadow: "0 2px 4px rgba(13,148,136,0.3)",
                  }}
                >
                  {isLoading ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      予測中...
                    </>
                  ) : (
                    "予測する"
                  )}
                </button>
              </div>
            </div>

            {/* モデル情報 */}
            {modelInfo && (
              <div
                className="mt-4 pt-4 flex flex-wrap gap-4 text-sm"
                style={{ borderTop: "1px solid #e2e8f0", color: "#64748b" }}
              >
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span>学習データ: <strong style={{ color: "#0d9488" }}>{modelInfo.data_count.toLocaleString()}件</strong></span>
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>期間: {modelInfo.date_range.from} 〜 {modelInfo.date_range.to}</span>
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>精度(AUC): <strong style={{ color: "#0d9488" }}>{(modelInfo.auc * 100).toFixed(1)}%</strong></span>
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>最終学習: {modelInfo.trained_at.split(" ")[0]}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Daily Stats */}
        {races.length > 0 && (() => {
          const stats = calculateStats(races);
          if (!stats) return null;
          return (
            <div
              className="mb-6 p-4 flex flex-wrap items-center justify-between gap-4"
              style={{
                background: stats.roi >= 100
                  ? "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)"
                  : "linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)",
                borderRadius: "16px",
                border: stats.roi >= 100 ? "1px solid #a7f3d0" : "1px solid #fca5a5",
              }}
            >
              <div className="flex items-center gap-2">
                <span style={{ fontSize: "24px" }}>{stats.roi >= 100 ? "📈" : "📉"}</span>
                <div>
                  <p className="text-sm font-medium" style={{ color: "#64748b" }}>本日の成績</p>
                  <p className="text-xs" style={{ color: "#94a3b8" }}>
                    確定 {stats.finishedRaces}R / 全 {races.length}R
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-xs" style={{ color: "#64748b" }}>単勝的中</p>
                  <p className="font-bold" style={{ color: "#1e293b" }}>
                    {stats.winHits}/{stats.finishedRaces}
                    <span className="text-sm font-normal ml-1">({stats.winRate.toFixed(0)}%)</span>
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs" style={{ color: "#64748b" }}>複勝的中</p>
                  <p className="font-bold" style={{ color: "#1e293b" }}>
                    {stats.winHits + stats.showHits}/{stats.finishedRaces}
                    <span className="text-sm font-normal ml-1">({stats.showRate.toFixed(0)}%)</span>
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs" style={{ color: "#64748b" }}>回収率</p>
                  <p
                    className="text-xl font-bold"
                    style={{ color: stats.roi >= 100 ? "#059669" : "#dc2626" }}
                  >
                    {stats.roi.toFixed(0)}%
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 今日の買い目セクション */}
        {races.length > 0 && !races.some(r => r.isLoading) && (() => {
          const autoBets = calculateAutoBets(races);
          if (autoBets.length === 0) return null;

          const totalBet = autoBets.reduce((sum, b) => sum + b.betAmount, 0);
          const finishedBets = autoBets.filter(b => b.isFinished);
          const hitBets = finishedBets.filter(b => b.result && b.result <= 3);
          const totalPayout = hitBets.reduce((sum, b) => {
            // 複勝的中時は平均オッズで計算
            const avgOdds = (b.placeOddsMin + b.placeOddsMax) / 2;
            return sum + Math.round(b.betAmount * avgOdds);
          }, 0);
          const pendingBets = autoBets.filter(b => !b.isFinished);

          return (
            <div
              className="mb-6 overflow-hidden"
              style={{
                background: "#fff",
                borderRadius: "16px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              }}
            >
              {/* ヘッダー */}
              <div
                className="px-5 py-4 text-white"
                style={{ background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: "24px" }}>🎯</span>
                    <div>
                      <h3 className="font-bold text-lg">今日の買い目</h3>
                      <p className="text-sm opacity-90">高回収率戦略（8R〜 & 差10%↑ & EV1.5↑）</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{autoBets.length}点</p>
                    <p className="text-sm opacity-90">合計 ¥{totalBet.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* 成績サマリー（確定レースがある場合） */}
              {finishedBets.length > 0 && (
                <div
                  className="px-5 py-3 flex items-center justify-between"
                  style={{
                    background: totalPayout >= finishedBets.reduce((s, b) => s + b.betAmount, 0)
                      ? "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)"
                      : "linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium" style={{ color: "#64748b" }}>
                      確定分: {hitBets.length}/{finishedBets.length}的中
                    </span>
                    <span className="text-sm" style={{ color: "#64748b" }}>
                      投資 ¥{finishedBets.reduce((s, b) => s + b.betAmount, 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: "#64748b" }}>払戻</span>
                    <span
                      className="text-lg font-bold"
                      style={{
                        color: totalPayout >= finishedBets.reduce((s, b) => s + b.betAmount, 0) ? "#059669" : "#dc2626"
                      }}
                    >
                      ¥{totalPayout.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {/* 買い目リスト */}
              <div className="grid gap-2 p-4">
                {autoBets.map((bet, idx) => (
                  <div
                    key={`${bet.raceId}-${bet.number}`}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{
                      background: bet.isFinished
                        ? bet.result && bet.result <= 3
                          ? "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)"
                          : "#fef2f2"
                        : "#f8fafc",
                      borderRadius: "12px",
                      border: bet.isFinished && bet.result && bet.result <= 3
                        ? "1px solid #86efac"
                        : "1px solid #e2e8f0",
                    }}
                  >
                    {/* レース番号 */}
                    <div
                      className="w-10 h-10 flex items-center justify-center font-bold shrink-0"
                      style={{
                        background: bet.isFinished ? "#e2e8f0" : "#fff",
                        borderRadius: "8px",
                        color: "#475569",
                        fontSize: "13px",
                      }}
                    >
                      {bet.raceId}R
                    </div>

                    {/* 馬番 */}
                    <div
                      className="w-9 h-9 flex items-center justify-center text-white font-bold shrink-0"
                      style={{
                        borderRadius: "50%",
                        background: bet.isFinished
                          ? bet.result && bet.result <= 3 ? "#22c55e" : "#9ca3af"
                          : "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)",
                        fontSize: "15px",
                      }}
                    >
                      {bet.number}
                    </div>

                    {/* 馬名・タイプ・結果 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold" style={{ color: "#1e293b", fontSize: "15px" }}>
                          {bet.name}
                        </span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-bold"
                          style={{
                            background: "#d1fae5",
                            color: "#065f46",
                          }}
                        >
                          買い
                        </span>
                        {bet.isFinished && bet.result && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-bold"
                            style={{
                              background: bet.result <= 3 ? "#22c55e" : "#ef4444",
                              color: "#fff",
                            }}
                          >
                            {bet.result}着{bet.result <= 3 && " ✓"}
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                        {bet.jockey} ・ 確信度 {bet.prob.toFixed(0)}%
                      </p>
                    </div>

                    {/* 複勝オッズ・EV・金額 */}
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1.5 justify-end">
                        <span
                          className="text-lg font-bold"
                          style={{ color: bet.ev >= 3.0 ? "#059669" : bet.ev >= 2.0 ? "#0d9488" : "#475569" }}
                        >
                          {bet.ev.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-xs" style={{ color: "#64748b" }}>
                        複{bet.placeOddsMin.toFixed(1)}-{bet.placeOddsMax.toFixed(1)}倍
                      </p>
                      <p className="text-xs font-medium" style={{ color: "#f59e0b" }}>
                        ¥{bet.betAmount}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* フッター */}
              <div
                className="px-4 py-3 flex items-center justify-between"
                style={{ background: "#fffbeb", borderTop: "1px solid #fde68a" }}
              >
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: "16px" }}>💡</span>
                  <span className="text-sm font-medium" style={{ color: "#92400e" }}>
                    すべて複勝で購入
                  </span>
                </div>
                <span className="text-xs" style={{ color: "#a16207" }}>
                  厳選フィルターで回収率150%+を狙う
                </span>
              </div>
            </div>
          );
        })()}

        {/* Results Header */}
        {races.length > 0 && (
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold" style={{ color: "#1e293b" }}>
                {currentTrack?.name}競馬場
              </h2>
              <span className="text-sm" style={{ color: "#64748b" }}>
                {new Date(selectedDate).toLocaleDateString("ja-JP", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
            <p className="text-sm" style={{ color: "#64748b" }}>
              カードをクリックで詳細表示
            </p>
          </div>
        )}

        {/* Race Cards Grid */}
        {races.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {races.map((race) => (
              <div
                key={race.id}
                className="overflow-hidden transition-all cursor-pointer"
                style={{
                  background: "#fff",
                  borderRadius: "16px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                }}
                onClick={() => !race.isLoading && setSelectedRace(race)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.12)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)";
                }}
              >
                {/* Race Header */}
                <div
                  className="px-4 py-3 text-white flex items-center justify-between"
                  style={{
                    background: race.result
                      ? "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)"
                      : "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)"
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-lg">{race.id}R</span>
                    {!race.isLoading && (
                      <>
                        <span className="text-sm opacity-80">{race.distance}m</span>
                        {race.time && !race.result && (
                          <span
                            className="text-xs px-2 py-0.5"
                            style={{ background: "rgba(255,255,255,0.2)", borderRadius: "4px" }}
                          >
                            {race.time}
                          </span>
                        )}
                        {race.result && (
                          <span
                            className="text-xs px-2 py-0.5 font-medium"
                            style={{ background: "rgba(255,255,255,0.25)", borderRadius: "4px" }}
                          >
                            確定
                          </span>
                        )}
                        {!race.result && race.predictions.length > 0 && (() => {
                          const rec = getBetRecommendation(race.predictions);
                          return (
                            <span
                              className="text-xs px-2 py-0.5 font-medium"
                              style={{
                                background: rec.type === "単勝" ? "#fbbf24" : "#60a5fa",
                                color: rec.type === "単勝" ? "#1e293b" : "#1e293b",
                                borderRadius: "4px",
                              }}
                            >
                              {rec.type}
                            </span>
                          );
                        })()}
                      </>
                    )}
                  </div>
                  {race.result ? (
                    <div className="flex items-center gap-1 text-sm font-bold">
                      {race.result.map((r, i) => (
                        <span
                          key={r.number}
                          className="w-6 h-6 flex items-center justify-center"
                          style={{
                            background: i === 0 ? "#fbbf24" : i === 1 ? "#9ca3af" : "#f97316",
                            borderRadius: "50%",
                            color: "#1e293b",
                            fontSize: "12px",
                          }}
                        >
                          {r.number}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <svg className="w-5 h-5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </div>

                {/* Predictions */}
                <div>
                  {race.isLoading ? (
                    <div className="p-4 space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="h-16 animate-pulse"
                          style={{ background: "#f1f5f9", borderRadius: "8px" }}
                        />
                      ))}
                    </div>
                  ) : (
                    race.predictions.slice(0, 3).map((pred, index) => {
                      // 人気順を計算（オッズが低い順）
                      const sortedByOdds = [...race.predictions]
                        .filter(p => p.odds > 0)
                        .sort((a, b) => a.odds - b.odds);
                      const popularity = sortedByOdds.findIndex(p => p.number === pred.number) + 1;

                      // 確信度による色分け
                      const prob = pred.prob * 100;
                      const probColor = prob >= 70 ? "#059669" : prob >= 50 ? "#0d9488" : prob >= 30 ? "#64748b" : "#94a3b8";

                      return (
                        <div
                          key={pred.number}
                          className="px-4 py-3"
                          style={{
                            borderBottom: index < 2 ? "1px solid #f1f5f9" : "none",
                            background: prob >= 70 ? "rgba(5, 150, 105, 0.04)" : pred.isValue ? "rgba(16, 185, 129, 0.02)" : undefined,
                          }}
                        >
                          {/* 1行目: 順位・馬番・馬名・確信度 */}
                          <div className="flex items-center gap-2">
                            {/* AI順位 */}
                            <div
                              className="w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0"
                              style={{
                                borderRadius: "4px",
                                background:
                                  pred.rank === 1
                                    ? "linear-gradient(135deg, #fef3c7, #fde68a)"
                                    : pred.rank === 2
                                    ? "linear-gradient(135deg, #f1f5f9, #e2e8f0)"
                                    : "linear-gradient(135deg, #fed7aa, #fdba74)",
                                color:
                                  pred.rank === 1
                                    ? "#92400e"
                                    : pred.rank === 2
                                    ? "#475569"
                                    : "#9a3412",
                              }}
                            >
                              {pred.rank}
                            </div>

                            {/* 馬番 */}
                            <div
                              className="w-7 h-7 flex items-center justify-center text-white text-sm font-bold shrink-0"
                              style={{
                                borderRadius: "50%",
                                background: "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)",
                              }}
                            >
                              {pred.number}
                            </div>

                            {/* 馬名 */}
                            <div className="flex-1 min-w-0">
                              <span className="font-bold text-sm" style={{ color: "#1e293b" }}>
                                {pred.name}
                              </span>
                            </div>

                            {/* 確信度 */}
                            <span
                              className="text-lg font-bold shrink-0"
                              style={{ color: probColor }}
                            >
                              {prob.toFixed(0)}%
                            </span>
                          </div>

                          {/* 2行目: 騎手・人気 */}
                          <div className="flex items-center gap-2 mt-1 ml-14">
                            <span className="text-xs" style={{ color: "#94a3b8" }}>
                              {pred.jockey}
                            </span>
                            {popularity > 0 && (
                              <span
                                className="text-xs px-1.5 py-0.5 rounded font-medium"
                                style={{
                                  background: popularity === 1 ? "#fef3c7" : popularity <= 3 ? "#fefce8" : "#f8fafc",
                                  color: popularity <= 3 ? "#a16207" : "#64748b"
                                }}
                              >
                                {popularity}人気
                              </span>
                            )}
                            {prob >= 70 && (
                              <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "#dcfce7", color: "#166534" }}>
                                おすすめ
                              </span>
                            )}
                          </div>

                          {/* 3行目: オッズ・期待値 */}
                          <div className="flex items-center gap-3 mt-1.5 ml-14">
                            {/* 単勝 */}
                            {pred.odds > 0 && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs" style={{ color: "#94a3b8" }}>単</span>
                                <span className="text-xs font-medium" style={{ color: "#475569" }}>
                                  {pred.odds.toFixed(1)}
                                </span>
                              </div>
                            )}
                            {/* 複勝 */}
                            {pred.placeOdds > 0 && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs" style={{ color: "#94a3b8" }}>複</span>
                                <span
                                  className="text-xs font-medium"
                                  style={{ color: pred.placeOdds >= 2 ? "#1d4ed8" : "#475569" }}
                                >
                                  {pred.placeOddsMin.toFixed(1)}-{pred.placeOddsMax.toFixed(1)}
                                </span>
                              </div>
                            )}
                            {/* 期待値 */}
                            {pred.expectedValue > 0 && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs" style={{ color: "#94a3b8" }}>EV</span>
                                <span
                                  className="text-xs font-bold"
                                  style={{ color: pred.expectedValue >= 1.0 ? "#059669" : "#64748b" }}
                                >
                                  {pred.expectedValue.toFixed(2)}
                                </span>
                                {pred.isValue && <span style={{ fontSize: "10px" }}>🔥</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Card Footer */}
                {!race.isLoading && race.predictions.length > 3 && (
                  <div
                    className="px-4 py-2 text-center text-sm"
                    style={{ background: "#f8fafc", color: "#64748b" }}
                  >
                    他 {race.predictions.length - 3} 頭
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="p-6 text-center"
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "16px",
            }}
          >
            <p className="font-medium" style={{ color: "#dc2626" }}>{error}</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && races.length === 0 && !error && (
          <div
            className="p-12 text-center"
            style={{
              background: "#fff",
              borderRadius: "16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            <svg className="w-16 h-16 mx-auto mb-4" style={{ color: "#cbd5e1" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-lg mb-2" style={{ color: "#64748b" }}>
              レース予測を開始しましょう
            </p>
            <p style={{ color: "#94a3b8" }}>
              日付と競馬場を選択して「予測する」をクリック
            </p>
          </div>
        )}
          </>
        )}

        {/* 分析タブ */}
        {activeTab === "analyze" && (
          <>
            {/* 日付選択 & 分析実行 */}
            <div
              className="mb-6 overflow-hidden"
              style={{
                background: "#fff",
                borderRadius: "16px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              }}
            >
              <div
                className="px-5 py-4 text-white flex items-center gap-3"
                style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <div>
                  <h3 className="font-semibold">誤答分析</h3>
                  <p className="text-sm opacity-90">予測と結果を照合して弱点を発見</p>
                </div>
              </div>

              <div className="p-5">
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <label className="block text-sm font-medium mb-2" style={{ color: "#475569" }}>
                      分析対象日
                    </label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full px-4 py-3 text-base outline-none transition-all"
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: "12px",
                        background: "#fff",
                      }}
                    />
                  </div>
                  <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className="px-6 py-3 text-white font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                    style={{
                      background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                      borderRadius: "12px",
                      boxShadow: "0 2px 4px rgba(99,102,241,0.3)",
                    }}
                  >
                    {isAnalyzing ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        分析中...
                      </>
                    ) : (
                      "分析実行"
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* エラー */}
            {analysisError && (
              <div
                className="mb-6 p-6 text-center"
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "16px",
                }}
              >
                <p className="font-medium" style={{ color: "#dc2626" }}>{analysisError}</p>
              </div>
            )}

            {/* 分析結果 */}
            {analysisResult && (
              <div className="space-y-6">
                {/* サマリー */}
                <div
                  className="p-6"
                  style={{
                    background: analysisResult.summary.show_rate >= 50
                      ? "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)"
                      : "linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)",
                    borderRadius: "16px",
                    border: analysisResult.summary.show_rate >= 50 ? "1px solid #a7f3d0" : "1px solid #fca5a5",
                  }}
                >
                  <h3 className="font-bold text-lg mb-4" style={{ color: "#1e293b" }}>
                    📊 {selectedDate} の成績
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <p className="text-sm" style={{ color: "#64748b" }}>レース数</p>
                      <p className="text-2xl font-bold" style={{ color: "#1e293b" }}>
                        {analysisResult.summary.total_races}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm" style={{ color: "#64748b" }}>単勝的中</p>
                      <p className="text-2xl font-bold" style={{ color: "#1e293b" }}>
                        {analysisResult.summary.win_hits}/{analysisResult.summary.total_races}
                        <span className="text-base font-normal ml-1">
                          ({analysisResult.summary.win_rate.toFixed(1)}%)
                        </span>
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm" style={{ color: "#64748b" }}>複勝的中</p>
                      <p className="text-2xl font-bold" style={{ color: analysisResult.summary.show_rate >= 50 ? "#059669" : "#dc2626" }}>
                        {analysisResult.summary.show_hits}/{analysisResult.summary.total_races}
                        <span className="text-base font-normal ml-1">
                          ({analysisResult.summary.show_rate.toFixed(1)}%)
                        </span>
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm" style={{ color: "#64748b" }}>複勝率</p>
                      <p
                        className="text-3xl font-bold"
                        style={{ color: analysisResult.summary.show_rate >= 50 ? "#059669" : "#dc2626" }}
                      >
                        {analysisResult.summary.show_rate.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>

                {/* 詳細分析グリッド */}
                <div className="grid md:grid-cols-2 gap-6">
                  {/* 馬場状態別 */}
                  <div
                    className="p-5"
                    style={{
                      background: "#fff",
                      borderRadius: "16px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                    }}
                  >
                    <h4 className="font-bold mb-4 flex items-center gap-2" style={{ color: "#1e293b" }}>
                      <span>🏟️</span> 馬場状態別
                    </h4>
                    <div className="space-y-3">
                      {Object.entries(analysisResult.by_track_condition).map(([cond, data]) => {
                        const rate = data.total > 0 ? (data.show_hits / data.total) * 100 : 0;
                        const isWeak = rate < analysisResult.summary.show_rate - 10;
                        return (
                          <div key={cond} className="flex items-center gap-3">
                            <span className="w-12 text-sm font-medium" style={{ color: "#475569" }}>{cond}</span>
                            <div className="flex-1 h-6 overflow-hidden" style={{ background: "#e2e8f0", borderRadius: "4px" }}>
                              <div
                                className="h-full flex items-center justify-end px-2 text-xs font-medium text-white"
                                style={{
                                  width: `${Math.max(rate, 5)}%`,
                                  background: isWeak
                                    ? "linear-gradient(135deg, #ef4444 0%, #f87171 100%)"
                                    : "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)",
                                  borderRadius: "4px",
                                }}
                              >
                                {rate.toFixed(0)}%
                              </div>
                            </div>
                            <span className="text-sm" style={{ color: "#64748b", minWidth: "50px" }}>
                              {data.show_hits}/{data.total}
                            </span>
                            {isWeak && <span title="平均より10%以上低い">⚠️</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 天気別 */}
                  <div
                    className="p-5"
                    style={{
                      background: "#fff",
                      borderRadius: "16px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                    }}
                  >
                    <h4 className="font-bold mb-4 flex items-center gap-2" style={{ color: "#1e293b" }}>
                      <span>🌤️</span> 天気別
                    </h4>
                    <div className="space-y-3">
                      {Object.entries(analysisResult.by_weather).map(([weather, data]) => {
                        const rate = data.total > 0 ? (data.show_hits / data.total) * 100 : 0;
                        const isWeak = rate < analysisResult.summary.show_rate - 10;
                        return (
                          <div key={weather} className="flex items-center gap-3">
                            <span className="w-12 text-sm font-medium" style={{ color: "#475569" }}>{weather}</span>
                            <div className="flex-1 h-6 overflow-hidden" style={{ background: "#e2e8f0", borderRadius: "4px" }}>
                              <div
                                className="h-full flex items-center justify-end px-2 text-xs font-medium text-white"
                                style={{
                                  width: `${Math.max(rate, 5)}%`,
                                  background: isWeak
                                    ? "linear-gradient(135deg, #ef4444 0%, #f87171 100%)"
                                    : "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)",
                                  borderRadius: "4px",
                                }}
                              >
                                {rate.toFixed(0)}%
                              </div>
                            </div>
                            <span className="text-sm" style={{ color: "#64748b", minWidth: "50px" }}>
                              {data.show_hits}/{data.total}
                            </span>
                            {isWeak && <span title="平均より10%以上低い">⚠️</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 距離別 */}
                  <div
                    className="p-5"
                    style={{
                      background: "#fff",
                      borderRadius: "16px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                    }}
                  >
                    <h4 className="font-bold mb-4 flex items-center gap-2" style={{ color: "#1e293b" }}>
                      <span>📏</span> 距離別
                    </h4>
                    <div className="space-y-3">
                      {Object.entries(analysisResult.by_distance).map(([dist, data]) => {
                        const rate = data.total > 0 ? (data.show_hits / data.total) * 100 : 0;
                        const isWeak = rate < analysisResult.summary.show_rate - 10;
                        return (
                          <div key={dist} className="flex items-center gap-3">
                            <span className="w-32 text-sm font-medium" style={{ color: "#475569" }}>{dist}</span>
                            <div className="flex-1 h-6 overflow-hidden" style={{ background: "#e2e8f0", borderRadius: "4px" }}>
                              <div
                                className="h-full flex items-center justify-end px-2 text-xs font-medium text-white"
                                style={{
                                  width: `${Math.max(rate, 5)}%`,
                                  background: isWeak
                                    ? "linear-gradient(135deg, #ef4444 0%, #f87171 100%)"
                                    : "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)",
                                  borderRadius: "4px",
                                }}
                              >
                                {rate.toFixed(0)}%
                              </div>
                            </div>
                            <span className="text-sm" style={{ color: "#64748b", minWidth: "50px" }}>
                              {data.show_hits}/{data.total}
                            </span>
                            {isWeak && <span title="平均より10%以上低い">⚠️</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 外れパターン */}
                  <div
                    className="p-5"
                    style={{
                      background: "#fff",
                      borderRadius: "16px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                    }}
                  >
                    <h4 className="font-bold mb-4 flex items-center gap-2" style={{ color: "#1e293b" }}>
                      <span>❌</span> 外れパターン
                    </h4>
                    {Object.keys(analysisResult.error_types).length > 0 ? (
                      <div className="space-y-3">
                        {Object.entries(analysisResult.error_types)
                          .sort((a, b) => b[1] - a[1])
                          .map(([errType, count]) => (
                            <div key={errType} className="flex items-center justify-between">
                              <span className="text-sm" style={{ color: "#475569" }}>{errType}</span>
                              <span
                                className="px-2 py-1 text-sm font-bold"
                                style={{
                                  background: count >= 5 ? "#fee2e2" : "#f1f5f9",
                                  color: count >= 5 ? "#dc2626" : "#64748b",
                                  borderRadius: "6px",
                                }}
                              >
                                {count}件
                              </span>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <p className="text-center py-4" style={{ color: "#64748b" }}>
                        外れなし 🎉
                      </p>
                    )}
                  </div>
                </div>

                {/* 注意書き */}
                <p className="text-center text-sm" style={{ color: "#94a3b8" }}>
                  ⚠️ = 平均より10%以上低い（改善ポイント）
                </p>
              </div>
            )}

            {/* 初期状態 */}
            {!isAnalyzing && !analysisResult && !analysisError && (
              <div
                className="p-12 text-center"
                style={{
                  background: "#fff",
                  borderRadius: "16px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                }}
              >
                <svg className="w-16 h-16 mx-auto mb-4" style={{ color: "#cbd5e1" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-lg mb-2" style={{ color: "#64748b" }}>
                  予測の精度を分析しましょう
                </p>
                <p style={{ color: "#94a3b8" }}>
                  レース終了後に日付を選択して「分析実行」をクリック
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Bottom Navigation - Mobile Only */}
      <nav
        className="fixed bottom-0 left-0 right-0 md:hidden"
        style={{
          background: "#fff",
          borderTop: "1px solid #e2e8f0",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex justify-around py-2">
          <button className="flex flex-col items-center gap-1 px-4 py-2" style={{ color: "#0d9488" }}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-xs font-medium">予測</span>
          </button>
          <button className="flex flex-col items-center gap-1 px-4 py-2" style={{ color: "#64748b" }}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs">履歴</span>
          </button>
          <button className="flex flex-col items-center gap-1 px-4 py-2" style={{ color: "#64748b" }}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-xs">統計</span>
          </button>
        </div>
      </nav>

      {/* Modal */}
      {selectedRace && (
        <RaceModal race={selectedRace} onClose={() => setSelectedRace(null)} />
      )}
    </div>
  );
}
