# Session Handover: gistdex_agent_query Token Limit Problem and Solution

## セッション概要

このセッションでは、gistdex MCPの`gistdex_agent_query`ツールがMCPのトークン制限（25000トークン）を超える問題の解決策を検討しました。前回のセッションでk値を5に制限するバリデーションを実装したが、それでも分析結果やヒントが多いため制限を超えることが判明しました。

## 問題の詳細

### 現状の課題
1. **トークン制限超過**
   - MCPツールのレスポンスは最大25000トークンに制限
   - gistdex_agent_queryはk=5でも制限を超える
   - k=3、maxIterations=1でも48727トークンと大幅超過

2. **レスポンスサイズの要因**
   - 検索結果（VectorSearchResult[]）
   - 詳細な分析（DetailedMetrics、EnhancedSemanticAnalysis等）
   - ヒント生成（NextActionSuggestion[]、ToolSuggestion[]等）
   - 進捗追跡（ProgressTracking）
   - デバッグ情報（DebugInfo）

## 検討した解決策

### 案1: ページネーション（初期案）

**アプローチ:**
```typescript
pagination: {
  page: number;
  includeAnalysis: boolean;
  includeHints: boolean;
  includeProgress: boolean;
  includeDebug: boolean;
}
```

**問題点:**
- エージェント（LLM）が自動的に次のページを取得できない
- MCPは単発のリクエスト/レスポンス形式
- 複数回の呼び出しを前提とした設計は実用的でない

### 案2: 継続トークン方式

**アプローチ:**
```typescript
{
  results: [...],
  summary: {
    totalResults: 50,
    returnedResults: 5,
    hasMore: true,
    continuationToken: "xxx"
  },
  hints: {
    nextActions: [{
      action: "get_more_details",
      suggestedTool: "gistdex_agent_query",
      parameters: { continuationToken: "xxx" }
    }]
  }
}
```

**問題点:**
- 状態管理が複雑
- エージェントが継続トークンの扱いを理解する必要がある

### 案3: 選択的フィールド返却

**アプローチ:**
```typescript
options: {
  includeResults: true,
  includeMetrics: false,
  includeAnalysis: false,
  includeHints: false,
  maxResultsSize: 5
}
```

**利点:**
- 必要な情報のみ取得可能
- トークン使用量を細かく制御

**問題点:**
- エージェントが必要なフィールドを事前に判断する必要がある

### 案4: サマリーモード（推奨案）

**アプローチ:**
```typescript
options: {
  mode: "summary" | "detailed" | "full"
}
```

**モード別の返却内容:**

1. **summary mode（デフォルト）**
   - 結果の要約（件数、平均スコア、主要トピック）
   - 主要メトリクス（最高/最低スコア、カバレッジ）
   - 最重要な次のアクション提案（1-2個）
   - トークン使用量: ~5000以下

2. **detailed mode**
   - 検索結果（上位5件）
   - 基本的な分析（メトリクス、セマンティック分析）
   - 主要なヒント
   - トークン使用量: ~15000以下

3. **full mode**
   - すべての情報（現在の実装と同等）
   - エラーになる可能性を許容

## 推奨実装計画

### 1. スキーマ更新（validation.ts）

```typescript
export const agentQueryToolSchema = z.object({
  query: z.string().min(1),
  goal: z.string().min(1),
  context: z.object({...}).optional(),
  options: z.object({
    k: z.number().int().positive().max(5).default(5),
    mode: z.enum(["summary", "detailed", "full"]).default("summary"),
    hybrid: z.boolean().optional(),
    rerank: z.boolean().optional(),
    includeDebug: z.boolean().optional()
  }).optional()
});
```

### 2. agent-query-tool.tsの実装変更

```typescript
async function handleAgentQueryOperation(
  data: AgentQueryInput,
  options: AgentQueryOptions,
): Promise<AgentQueryResult> {
  const mode = data.options?.mode ?? "summary";

  // 検索実行（共通）
  const results = await performSearch(data, options);

  switch (mode) {
    case "summary":
      return createSummaryResponse(results, data);
    case "detailed":
      return createDetailedResponse(results, data);
    case "full":
      return createFullResponse(results, data);
  }
}

function createSummaryResponse(results, data): AgentQueryResult {
  return {
    success: true,
    message: "Summary generated",
    summary: {
      totalResults: results.length,
      avgScore: calculateAvg(results),
      topTopics: extractTopTopics(results),
      coverageStatus: assessCoverage(data.goal, results)
    },
    primaryAction: generatePrimaryAction(results),
    recommendation: {
      needsMoreDetail: results.length > 0 && avgScore > 0.7,
      suggestedMode: avgScore > 0.8 ? null : "detailed"
    }
  };
}
```

### 3. MCPサーバーの説明更新（server.ts）

```typescript
{
  name: "gistdex_agent_query",
  description:
    "Autonomous agent-based search with strategic planning. " +
    "Supports three modes: " +
    "- summary: Quick overview and recommendations (default, <5K tokens) " +
    "- detailed: Results with analysis (~15K tokens) " +
    "- full: Complete information (may exceed token limits) " +
    "Start with summary mode, then use detailed if needed.",
  inputSchema: {...}
}
```

### 4. エージェントワークフロー

1. **初回呼び出し**（summary mode）
   ```typescript
   const initial = await gistdex_agent_query({
     query: "...",
     goal: "...",
     options: { mode: "summary" }
   });
   ```

2. **エージェントの判断**
   - サマリーで十分 → 終了
   - 詳細が必要 → detailed modeで再呼び出し

3. **詳細取得**（必要な場合）
   ```typescript
   const detailed = await gistdex_agent_query({
     query: "...",
     goal: "...",
     options: { mode: "detailed" }
   });
   ```

## 実装の利点

1. **エージェントフレンドリー**
   - 自然な段階的情報取得
   - 明確なモード選択
   - 既存のAgent in the Loopパターンと整合

2. **トークン効率**
   - デフォルトで軽量
   - 必要に応じて詳細取得
   - 予測可能なトークン使用量

3. **後方互換性**
   - 既存のツールに影響なし
   - オプショナルなmode パラメータ
   - デフォルトはsummaryで安全

4. **実装の簡潔性**
   - 複雑な状態管理不要
   - 明確な責任分離
   - テストしやすい

## 次のステップ

1. validation.tsにmodeパラメータ追加
2. agent-query-tool.tsでモード別レスポンス実装
3. 各モードのトークン使用量測定
4. MCPサーバーのスキーマ・説明更新
5. テストケース追加
6. ドキュメント更新

## 重要な考慮事項

- **エージェントの学習コスト**: モード選択はシンプルで直感的
- **デフォルトの安全性**: summaryモードで確実にトークン制限内
- **段階的詳細化**: 必要な情報のみ取得する設計
- **既存ツールとの整合性**: 他のgistdexツールと一貫した設計

この実装により、gistdex_agent_queryのトークン制限問題を解決し、エージェントがより効率的に情報を取得できるようになります。