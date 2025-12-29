"use client";

import { useState } from "react";

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

interface Race {
  id: string;
  name: string;
  distance: number;
  time: string;
  predictions: Prediction[];
}

interface RaceWithLoading extends Race {
  isLoading?: boolean;
}

export default function Home() {
  const [selectedTrack, setSelectedTrack] = useState(TRACKS[0].code);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [isLoading, setIsLoading] = useState(false);
  const [races, setRaces] = useState<RaceWithLoading[]>([]);
  const [error, setError] = useState<string | null>(null);

  const currentTrack = TRACKS.find((t) => t.code === selectedTrack);

  const handlePredict = async () => {
    setIsLoading(true);
    setError(null);
    setRaces([]);

    try {
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
              name: raceData.name,
              distance: raceData.distance,
              time: raceData.time,
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
        className="sticky top-0 z-50 text-white"
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
          {/* Card Header */}
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

          {/* Card Body */}
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 日付 */}
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

              {/* 競馬場 */}
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

              {/* ボタン */}
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
          </div>
        </div>

        {/* Results Header */}
        {races.length > 0 && (
          <div className="flex items-center gap-3 mb-4">
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
        )}

        {/* Race Cards Grid */}
        {races.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {races.map((race) => (
              <div
                key={race.id}
                className="overflow-hidden transition-all hover:-translate-y-0.5"
                style={{
                  background: "#fff",
                  borderRadius: "16px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                }}
              >
                {/* Race Header */}
                <div
                  className="px-4 py-3 text-white flex items-center gap-3"
                  style={{ background: "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)" }}
                >
                  <span className="font-bold text-lg">{race.id}R</span>
                  {!race.isLoading && (
                    <span className="text-sm opacity-80">{race.distance}m</span>
                  )}
                </div>

                {/* Predictions */}
                <div>
                  {race.isLoading ? (
                    <div className="p-4 space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="h-12 animate-pulse"
                          style={{ background: "#f1f5f9", borderRadius: "8px" }}
                        />
                      ))}
                    </div>
                  ) : (
                    race.predictions.map((pred) => (
                      <div
                        key={pred.number}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
                        style={{ borderBottom: "1px solid #f1f5f9" }}
                      >
                        {/* Rank Badge */}
                        <div
                          className="w-7 h-7 flex items-center justify-center text-xs font-bold"
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

                        {/* Horse Number */}
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

                        {/* Name */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: "#1e293b" }}>
                            {pred.name}
                          </p>
                          {pred.isValue && (
                            <span
                              className="text-xs font-semibold px-2 py-0.5"
                              style={{
                                background: "#d1fae5",
                                color: "#065f46",
                                borderRadius: "6px",
                              }}
                            >
                              妙味
                            </span>
                          )}
                        </div>

                        {/* Probability */}
                        <div
                          className="text-lg font-bold"
                          style={{ color: "#0d9488", fontFamily: "monospace" }}
                        >
                          {(pred.prob * 100).toFixed(0)}%
                        </div>
                      </div>
                    ))
                  )}
                </div>
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
            <svg className="w-12 h-12 mx-auto mb-4" style={{ color: "#cbd5e1" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p style={{ color: "#94a3b8" }}>
              日付と競馬場を選択して予測してください
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
    </div>
  );
}
