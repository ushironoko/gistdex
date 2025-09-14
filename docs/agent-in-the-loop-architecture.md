# Agent in the Loop アーキテクチャ

## 概要

Agent in the Loop（エージェント・イン・ザ・ループ）は、自動実行ではなく、エージェント（LLM）が各ステップで介入し、フィードバックループを通じて検索クエリを改善していく仕組みです。

## アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────┐
│                         LLM Agent                            │
│  (Claude / GPT-4 など、MCPクライアントとして動作)              │
└────────┬───────────────────────────────────┬─────────────────┘
         │                                   │
         │ 1. 評価要求                       │ 4. フィードバック
         ▼                                   ▼
┌─────────────────────────────────────────────────────────────┐
│                      MCP Server Layer                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              3つのAgent in the Loop Tools             │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │                                                        │  │
│  │  1. gistdex_evaluate (evaluate-tool.ts)               │  │
│  │     └─> 検索結果を目標に対して評価                      │  │
│  │                                                        │  │
│  │  2. gistdex_refine_query (refine-query-tool.ts)       │  │
│  │     └─> 評価に基づいてクエリを改善                      │  │
│  │                                                        │  │
│  │  3. gistdex_plan_execute_stage (plan-execute-stage.ts)│  │
│  │     └─> 計画の単一ステージを実行                        │  │
│  │                                                        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ 2. 検索実行
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Core Search Layer                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  semanticSearch() / hybridSearch()                    │  │
│  │  └─> ベクトルDB検索の実行                              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ 3. 結果保存
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Cache Layer                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  agent-cache.ts                                       │  │
│  │  ├─> saveEvaluationToCache()                         │  │
│  │  ├─> saveRefinementToCache()                         │  │
│  │  └─> saveStageToCache()                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  保存先: .gistdex/cache/agent/                              │
│  ├── evaluations/   (評価結果)                              │
│  ├── refinements/   (クエリ改善履歴)                        │
│  ├── stages/        (ステージ実行結果)                       │
│  └── sessions/      (セッション全体のサマリー)               │
└──────────────────────────────────────────────────────────────┘
```

## Step by Step の処理フロー

### Step 1: 初期クエリの実行

```typescript
// エージェントが最初のクエリを実行
エージェント → gistdex_query("VitePress configuration")
         ↓
結果: 5件のドキュメントチャンク
```

### Step 2: 結果の評価

```typescript
// エージェントが結果を評価ツールに送信
エージェント → gistdex_evaluate({
  goal: "VitePressの設定方法を理解する",
  query: "VitePress configuration",
  results: [/* 検索結果 */]
})
         ↓
評価結果: {
  confidence: 0.6,        // 60%の自信度
  coverage: 0.5,          // 50%のカバレッジ
  foundAspects: ["基本設定"],
  missingAspects: ["テーマ設定", "プラグイン"],
  shouldContinue: true,   // 改善が必要
  recommendations: {
    action: "refine",
    reason: "重要な側面が不足"
  }
}
```

### Step 3: クエリの改善

```typescript
// エージェントが評価に基づいてクエリを改善
エージェント → gistdex_refine_query({
  currentQuery: "VitePress configuration",
  goal: "VitePressの設定方法を理解する",
  missingAspects: ["テーマ設定", "プラグイン"],
  strategy: "broaden"  // より広範囲に検索
})
         ↓
改善結果: {
  refinedQuery: "VitePress theme plugin customization setup",
  reasoning: "不足している側面を含むように拡張",
  alternatives: [
    { query: "VitePress config.js", purpose: "設定ファイル特化" },
    { query: "VitePress extending default theme", purpose: "テーマ拡張" }
  ]
}
```

### Step 4: 改善されたクエリで再検索

```typescript
// エージェントが改善されたクエリで再度検索
エージェント → gistdex_query("VitePress theme plugin customization setup")
         ↓
結果: より関連性の高い8件のドキュメント
```

### Step 5: 再評価とループ

```typescript
// 再度評価を実行
エージェント → gistdex_evaluate({
  goal: "VitePressの設定方法を理解する",
  query: "VitePress theme plugin customization setup",
  results: [/* 新しい検索結果 */],
  iteration: 2
})
         ↓
評価結果: {
  confidence: 0.85,       // 85%に向上
  coverage: 0.90,         // 90%に向上
  shouldContinue: false,  // 十分な結果
  recommendations: {
    action: "use_results",
    reason: "目標を達成する十分な情報"
  }
}
```

### Step 6: キャッシュへの保存

各ステップの結果は自動的にキャッシュに保存されます：

```typescript
// 評価結果の保存
.gistdex/cache/agent/evaluations/eval-1234567890-1.json
{
  "goal": "VitePressの設定方法を理解する",
  "query": "VitePress configuration",
  "confidence": 0.6,
  "iteration": 1,
  "timestamp": "2025-01-14T06:00:00.000Z"
}

// クエリ改善の保存
.gistdex/cache/agent/refinements/refine-1234567891-1.json
{
  "currentQuery": "VitePress configuration",
  "refinedQuery": "VitePress theme plugin customization setup",
  "strategy": "broaden",
  "reasoning": "不足している側面を含むように拡張"
}

// 集約されたMarkdownサマリー
.gistdex/cache/agent/agent-cache.md
```

## 計画実行モード（Plan Execute Stage）

より複雑な検索タスクの場合、事前に計画を立てて段階的に実行：

### Plan Execute のフロー

```typescript
// Step 1: 計画の作成
const plan = {
  id: "plan-abc123",
  goal: "VitePressで多言語サイトを構築する方法",
  stages: [
    {
      stageNumber: 1,
      description: "基本的な国際化設定を調査",
      query: "VitePress i18n internationalization",
      expectedResults: {
        keywords: ["locales", "lang", "translations"],
        minConfidence: 0.7
      }
    },
    {
      stageNumber: 2,
      description: "ルーティングとURL構造を調査",
      query: "VitePress multilingual routing URL structure",
      expectedResults: {
        keywords: ["rewrites", "links", "paths"],
        minConfidence: 0.7
      }
    }
  ]
}

// Step 2: 各ステージの実行
エージェント → gistdex_plan_execute_stage({
  planId: "plan-abc123",
  stageIndex: 0,
  plan: plan,
  queryOptions: { k: 10, hybrid: true }
})
         ↓
結果: {
  success: true,
  evaluation: { score: 0.75, isSuccessful: true },
  shouldContinue: true,
  agentGuidance: {
    nextAction: "次のステージに進むか、このステージを改善",
    suggestedTools: ["gistdex_refine_query", "gistdex_evaluate"]
  }
}
```

## モジュール間の関係性

```
1. MCP Tools (エントリーポイント)
   ├── evaluate-tool.ts
   │   └─> query-planner.ts (評価ロジック)
   │
   ├── refine-query-tool.ts
   │   └─> query-planner.ts (改善ロジック)
   │
   └── plan-execute-stage-tool.ts
       ├─> query-planner.ts (実行ロジック)
       ├─> search.ts (検索実行)
       └─> agent-cache.ts (結果保存)

2. Query Planner (中核ロジック)
   query-planner.ts
   ├── evaluateResults()    - 結果評価
   ├── refineQuery()        - クエリ改善
   ├── executeSingleStage() - ステージ実行
   └── analyzeContent()     - コンテンツ分析

3. Cache Layer (永続化)
   agent-cache.ts
   ├── saveEvaluationToCache()
   ├── saveRefinementToCache()
   ├── saveStageToCache()
   └── saveAgentSession()

4. Core Search (検索エンジン)
   search.ts
   ├── semanticSearch()  - セマンティック検索
   ├── hybridSearch()    - ハイブリッド検索
   └── getOriginalContent() - 完全なコンテンツ取得
```

## 主要な利点

1. **エージェントの制御**: 自動実行ではなく、エージェントが各ステップを制御
2. **フィードバックループ**: 評価結果に基づいて継続的に改善
3. **透明性**: 各ステップの結果と判断理由が明確
4. **柔軟性**: 様々な戦略（broaden/narrow/pivot）で対応
5. **学習**: キャッシュにより過去の検索パターンから学習可能
6. **タイムアウト**: 長時間実行を防ぐため30秒のタイムアウト設定

## 使用例

```typescript
// LLMエージェント側のコード例
async function searchWithAgentInTheLoop(goal: string) {
  let query = generateInitialQuery(goal);
  let iteration = 0;
  let shouldContinue = true;

  while (shouldContinue && iteration < 5) {
    // 検索実行
    const results = await gistdex_query(query);

    // 評価
    const evaluation = await gistdex_evaluate({
      goal,
      query,
      results,
      iteration
    });

    shouldContinue = evaluation.shouldContinue;

    if (shouldContinue) {
      // クエリ改善
      const refinement = await gistdex_refine_query({
        currentQuery: query,
        goal,
        missingAspects: evaluation.missingAspects,
        strategy: determineStrategy(evaluation)
      });

      query = refinement.refinedQuery;
    }

    iteration++;
  }

  return { finalQuery: query, iterations: iteration };
}
```

これがAgent in the Loopアーキテクチャの完全な仕組みです。エージェントが能動的に検索プロセスを制御し、フィードバックに基づいて継続的に改善することで、より精度の高い検索結果を得ることができます。