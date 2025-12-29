"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// API URL (環境変数から取得、なければローカル)
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// 競馬場データ
const TRACKS = [
  { name: "大井", code: "44", emoji: "🏟️" },
  { name: "川崎", code: "45", emoji: "🌊" },
  { name: "船橋", code: "43", emoji: "⚓" },
  { name: "浦和", code: "42", emoji: "🌸" },
  { name: "門別", code: "30", emoji: "🐴" },
  { name: "盛岡", code: "35", emoji: "⛰️" },
  { name: "水沢", code: "36", emoji: "💧" },
  { name: "金沢", code: "46", emoji: "✨" },
  { name: "笠松", code: "47", emoji: "🎋" },
  { name: "名古屋", code: "48", emoji: "🏯" },
  { name: "園田", code: "50", emoji: "🌳" },
  { name: "姫路", code: "51", emoji: "🏰" },
  { name: "高知", code: "54", emoji: "🐋" },
  { name: "佐賀", code: "55", emoji: "🎋" },
];

// 型定義
interface Prediction {
  rank: number;
  number: number;
  name: string;
  jockey: string;
  prob: number;
  win_rate: number;
  show_rate: number;
}

interface Race {
  id: string;
  name: string;
  distance: number;
  time: string;
  predictions: Prediction[];
}

export default function Home() {
  const [selectedTrack, setSelectedTrack] = useState(TRACKS[0]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [races, setRaces] = useState<Race[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handlePredict = async () => {
    setIsLoading(true);
    setError(null);
    setRaces([]);

    try {
      const response = await fetch(`${API_URL}/api/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          track_code: selectedTrack.code,
          date: selectedDate,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "予測に失敗しました");
      }

      const data = await response.json();

      // APIレスポンスをフロントエンド用に変換
      const formattedRaces: Race[] = data.races.map((race: {
        id: string;
        name: string;
        distance: number;
        time: string;
        predictions: Array<{
          rank: number;
          number: number;
          name: string;
          jockey: string;
          prob: number;
          win_rate: number;
          show_rate: number;
        }>;
      }) => ({
        id: race.id,
        name: race.name,
        distance: race.distance,
        time: race.time,
        predictions: race.predictions.map((pred) => ({
          rank: pred.rank,
          number: pred.number,
          name: pred.name,
          jockey: pred.jockey,
          prob: pred.prob,
          winRate: pred.win_rate,
          showRate: pred.show_rate,
        })),
      }));

      setRaces(formattedRaces);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1:
        return {
          bg: "bg-gradient-to-r from-amber-500/20 to-yellow-500/20",
          border: "border-amber-500/50",
          badge: "gradient-gold text-slate-900",
          glow: "shadow-amber-500/20",
        };
      case 2:
        return {
          bg: "bg-gradient-to-r from-slate-400/20 to-gray-300/20",
          border: "border-slate-400/50",
          badge: "gradient-silver text-slate-900",
          glow: "shadow-slate-400/20",
        };
      case 3:
        return {
          bg: "bg-gradient-to-r from-orange-600/20 to-amber-600/20",
          border: "border-orange-600/50",
          badge: "gradient-bronze text-white",
          glow: "shadow-orange-500/20",
        };
      default:
        return {
          bg: "bg-card",
          border: "border-border",
          badge: "bg-muted",
          glow: "",
        };
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* PC用サイドバー + メインコンテンツ */}
      <div className="lg:flex">
        {/* サイドバー（PCのみ） */}
        <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col">
          <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-border/50 bg-card/50 px-6 py-8">
            {/* ロゴ */}
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-primary text-2xl">
                🏇
              </div>
              <div>
                <h1 className="text-xl font-bold">地方競馬AI</h1>
                <p className="text-xs text-muted-foreground">AI Prediction</p>
              </div>
            </div>

            {/* 日付選択 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">予測日</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* 競馬場選択 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">競馬場</label>
              <div className="grid grid-cols-2 gap-2">
                {TRACKS.map((track) => (
                  <button
                    key={track.code}
                    onClick={() => setSelectedTrack(track)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-all ${
                      selectedTrack.code === track.code
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                        : "bg-secondary/50 hover:bg-secondary"
                    }`}
                  >
                    <span>{track.emoji}</span>
                    <span>{track.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 予測ボタン */}
            <Button
              onClick={handlePredict}
              disabled={isLoading}
              className="w-full rounded-xl py-6 text-base gradient-primary border-0 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  予測中...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="text-lg">🔮</span>
                  予測を実行
                </span>
              )}
            </Button>

            {/* ステータス */}
            <div className="mt-auto rounded-xl bg-secondary/50 p-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-muted-foreground">モデル: {selectedTrack.name}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                最終更新: 2024/12/29
              </p>
            </div>
          </div>
        </aside>

        {/* メインコンテンツ */}
        <main className="lg:pl-72 flex-1">
          {/* モバイルヘッダー */}
          <header className="sticky top-0 z-50 border-b border-border/50 glass lg:hidden">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-primary text-lg">
                    🏇
                  </div>
                  <h1 className="font-bold">地方競馬AI</h1>
                </div>
                <Badge variant="outline" className="border-primary/50 text-primary">
                  β版
                </Badge>
              </div>
            </div>
          </header>

          {/* モバイル: 競馬場タブ */}
          <div className="border-b border-border/50 lg:hidden overflow-x-auto">
            <div className="flex gap-2 px-4 py-3">
              {TRACKS.map((track) => (
                <button
                  key={track.code}
                  onClick={() => setSelectedTrack(track)}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm transition-all ${
                    selectedTrack.code === track.code
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                      : "bg-secondary/50 hover:bg-secondary"
                  }`}
                >
                  <span>{track.emoji}</span>
                  <span>{track.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* モバイル: 日付選択 & 予測ボタン */}
          <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3 lg:hidden">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="flex-1 rounded-xl border border-border bg-secondary/50 px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
            <Button
              onClick={handlePredict}
              disabled={isLoading}
              className="rounded-xl px-6 gradient-primary border-0 shadow-lg shadow-primary/25"
            >
              {isLoading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                "🔮 予測"
              )}
            </Button>
          </div>

          {/* PC: ヘッダー */}
          <div className="hidden lg:block border-b border-border/50 px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  {selectedTrack.emoji} {selectedTrack.name}競馬場
                </h2>
                <p className="text-muted-foreground mt-1">
                  {new Date(selectedDate).toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    weekday: "long",
                  })}
                </p>
              </div>
              <Badge variant="outline" className="border-primary/50 text-primary px-4 py-1">
                {races.length} レース
              </Badge>
            </div>
          </div>

          {/* レース一覧 */}
          <div className="p-4 lg:p-8">
            <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="overflow-hidden">
                    <div className="p-4 space-y-4">
                      <Skeleton className="h-6 w-32" />
                      <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, j) => (
                          <Skeleton key={j} className="h-16 w-full rounded-xl" />
                        ))}
                      </div>
                    </div>
                  </Card>
                ))
              ) : races.length > 0 ? (
                races.map((race) => (
                  <Card key={race.id} className="overflow-hidden bg-card/50 backdrop-blur border-border/50 hover:border-primary/30 transition-all">
                    {/* レースヘッダー */}
                    <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 bg-secondary/30">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold">
                          {race.id}R
                        </div>
                        <div>
                          <h3 className="font-semibold">{race.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            {race.distance}m • {race.time}発走
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* 予測結果 */}
                    <div className="p-4 space-y-3">
                      {race.predictions.map((pred) => {
                        const style = getRankStyle(pred.rank);
                        return (
                          <div
                            key={pred.number}
                            className={`flex items-center gap-3 rounded-xl border p-3 transition-all hover:scale-[1.02] ${style.bg} ${style.border} ${style.glow} shadow-lg`}
                          >
                            {/* 順位バッジ */}
                            <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${style.badge}`}>
                              {pred.rank}
                            </div>

                            {/* 馬番 */}
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground shadow-lg shadow-primary/30">
                              {pred.number}
                            </div>

                            {/* 馬情報 */}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold truncate">{pred.name}</p>
                              <p className="text-xs text-muted-foreground">
                                勝率 {pred.winRate}% • 複勝 {pred.showRate}%
                              </p>
                            </div>

                            {/* 確率 */}
                            <div className="text-right">
                              <p className="text-xl font-bold text-primary">
                                {(pred.prob * 100).toFixed(0)}
                                <span className="text-sm">%</span>
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                ))
              ) : error ? (
                <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
                  <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                    <span className="text-4xl">⚠️</span>
                  </div>
                  <p className="text-lg font-medium text-destructive">{error}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    日付や競馬場を変更して再度お試しください
                  </p>
                </div>
              ) : (
                <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
                  <div className="h-20 w-20 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
                    <span className="text-4xl">🔮</span>
                  </div>
                  <p className="text-lg font-medium">予測を実行してください</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    競馬場と日付を選択して「予測を実行」ボタンを押してください
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* モバイル: ボトムナビ */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-border/50 glass lg:hidden">
        <div className="flex items-center justify-around py-2">
          <button className="flex flex-col items-center gap-1 px-6 py-2 text-primary">
            <span className="text-xl">🏠</span>
            <span className="text-[10px] font-medium">ホーム</span>
          </button>
          <button className="flex flex-col items-center gap-1 px-6 py-2 text-muted-foreground hover:text-primary transition-colors">
            <span className="text-xl">📊</span>
            <span className="text-[10px] font-medium">履歴</span>
          </button>
          <button className="flex flex-col items-center gap-1 px-6 py-2 text-muted-foreground hover:text-primary transition-colors">
            <span className="text-xl">⚙️</span>
            <span className="text-[10px] font-medium">設定</span>
          </button>
        </div>
      </nav>

      {/* モバイル: ボトムナビのスペーサー */}
      <div className="h-20 lg:hidden" />
    </div>
  );
}
