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
  expectedValue: number;
  isValue: boolean;
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
            className="px-6 py-3 text-xs flex items-center gap-4"
            style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}
          >
            <span style={{ color: "#64748b" }}>順位</span>
            <span style={{ color: "#64748b" }}>馬番</span>
            <span style={{ color: "#64748b" }} className="flex-1">馬名 / 騎手</span>
            <span style={{ color: "#64748b", width: "60px", textAlign: "right" }}>オッズ</span>
            <span style={{ color: "#64748b", width: "50px", textAlign: "right" }}>勝率</span>
            <span style={{ color: "#64748b", width: "50px", textAlign: "right" }}>複勝</span>
            <span style={{ color: "#64748b", width: "60px", textAlign: "right" }}>AI予測</span>
          </div>

          {race.predictions.map((pred, index) => (
            <div
              key={pred.number}
              className="px-6 py-4 flex items-center gap-4 transition-colors hover:bg-slate-50"
              style={{
                borderBottom: index < race.predictions.length - 1 ? "1px solid #f1f5f9" : "none",
                background: pred.isValue ? "rgba(16, 185, 129, 0.05)" : undefined,
              }}
            >
              {/* 順位 */}
              <div
                className="w-8 h-8 flex items-center justify-center text-sm font-bold"
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
                className="w-10 h-10 flex items-center justify-center text-white font-bold"
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
                <div className="flex items-center gap-2">
                  <p className="font-semibold truncate" style={{ color: "#1e293b" }}>
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
                            : "#f97316",
                        color: "#1e293b",
                        borderRadius: "4px",
                      }}
                    >
                      {resultMap.get(pred.number)}着
                    </span>
                  )}
                  {pred.isValue && (
                    <span style={{ fontSize: "16px" }}>🔥</span>
                  )}
                </div>
                <p className="text-sm" style={{ color: "#64748b" }}>
                  {pred.jockey}
                </p>
              </div>

              {/* オッズ */}
              <div style={{ width: "60px", textAlign: "right" }}>
                <span
                  className="font-bold"
                  style={{
                    color: pred.odds < 5 ? "#dc2626" : pred.odds < 10 ? "#ea580c" : "#64748b",
                  }}
                >
                  {pred.odds > 0 ? pred.odds.toFixed(1) : "-"}
                </span>
              </div>

              {/* 勝率 */}
              <div style={{ width: "50px", textAlign: "right" }}>
                <span style={{ color: "#475569", fontSize: "0.875rem" }}>
                  {pred.winRate.toFixed(0)}%
                </span>
              </div>

              {/* 複勝率 */}
              <div style={{ width: "50px", textAlign: "right" }}>
                <span style={{ color: "#475569", fontSize: "0.875rem" }}>
                  {pred.showRate.toFixed(0)}%
                </span>
              </div>

              {/* AI予測 */}
              <div style={{ width: "60px", textAlign: "right" }}>
                <span
                  className="text-lg font-bold"
                  style={{ color: "#0d9488", fontFamily: "monospace" }}
                >
                  {(pred.prob * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}
        >
          <div className="flex items-center gap-4 text-sm" style={{ color: "#64748b" }}>
            <div className="flex items-center gap-1">
              <span style={{ fontSize: "14px" }}>🔥</span>
              <span>= 期待値 &gt; 1.5（狙い目）</span>
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

  const currentTrack = TRACKS.find((t) => t.code === selectedTrack);

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

  const handlePredict = async () => {
    setIsLoading(true);
    setError(null);
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
          (race: { id: string; race_id: string; name: string; distance: number; time: string; field_size: number; predictions: { rank: number; number: number; name: string; jockey: string; prob: number; win_rate: number; show_rate: number }[] }) => ({
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
              expectedValue: 0,
              isValue: false,
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
              const oddsDict: Record<number, number> = oddsData.odds;
              const raceResult: RaceResult[] | null = oddsData.result;

              setRaces((prev) =>
                prev.map((r) => {
                  if (r.id !== race.id) return r;
                  return {
                    ...r,
                    result: raceResult,
                    predictions: r.predictions.map((pred) => {
                      const odds = oddsDict[pred.number] || 0;
                      const expectedValue = pred.prob * odds;
                      return {
                        ...pred,
                        odds,
                        expectedValue,
                        isValue: expectedValue > 1.5,
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
              const formattedRace: RaceWithLoading = {
                id: raceData.id,
                name: raceData.name || "",
                distance: raceData.distance,
                time: raceData.time || "",
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
                    expected_value: number;
                    is_value: boolean;
                  }) => ({
                    rank: pred.rank,
                    number: pred.number,
                    name: pred.name,
                    jockey: pred.jockey,
                    prob: pred.prob,
                    winRate: pred.win_rate,
                    showRate: pred.show_rate,
                    odds: pred.odds,
                    expectedValue: pred.expected_value,
                    isValue: pred.is_value,
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
          <h1 className="text-lg font-semibold">地方競馬 AI 予測</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 pb-24 md:pb-6">
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
                  onClick={handlePredict}
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
                          className="h-14 animate-pulse"
                          style={{ background: "#f1f5f9", borderRadius: "8px" }}
                        />
                      ))}
                    </div>
                  ) : (
                    race.predictions.slice(0, 3).map((pred, index) => (
                      <div
                        key={pred.number}
                        className="flex items-center gap-3 px-4 py-3"
                        style={{
                          borderBottom: index < 2 ? "1px solid #f1f5f9" : "none",
                          background: pred.isValue ? "rgba(16, 185, 129, 0.05)" : undefined,
                        }}
                      >
                        {/* 順位 */}
                        <div
                          className="w-7 h-7 flex items-center justify-center text-xs font-bold"
                          style={{
                            borderRadius: "8px",
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
                          className="w-8 h-8 flex items-center justify-center text-white text-sm font-bold"
                          style={{
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)",
                            boxShadow: "0 2px 4px rgba(13,148,136,0.3)",
                          }}
                        >
                          {pred.number}
                        </div>

                        {/* 馬名・騎手・妙味 */}
                        <div className="flex-1 min-w-0" style={{ maxWidth: "120px" }}>
                          <div className="flex items-center gap-1">
                            <p className="text-sm font-medium" style={{ color: "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {pred.name}
                            </p>
                            {pred.isValue && (
                              <span style={{ fontSize: "14px", flexShrink: 0 }}>🔥</span>
                            )}
                          </div>
                          <p className="text-xs" style={{ color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {pred.jockey}
                          </p>
                        </div>

                        {/* オッズ */}
                        <div className="text-right">
                          <p
                            className="text-sm font-bold"
                            style={{
                              color: pred.odds < 5 ? "#dc2626" : pred.odds < 10 ? "#ea580c" : "#64748b",
                            }}
                          >
                            {pred.odds > 0 ? `${pred.odds.toFixed(1)}倍` : "-"}
                          </p>
                        </div>

                        {/* 確率 */}
                        <div className="text-right" style={{ minWidth: "48px" }}>
                          <p
                            className="text-lg font-bold"
                            style={{ color: "#0d9488", fontFamily: "monospace" }}
                          >
                            {(pred.prob * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>
                    ))
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
