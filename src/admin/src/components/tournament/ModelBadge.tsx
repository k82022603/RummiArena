/**
 * ModelBadge — 모델 색상 뱃지 (ADR 45 §5.1)
 */
import type { RoundHistoryModelType } from "@/lib/types";

export const MODEL_BADGE_STYLES: Record<RoundHistoryModelType, string> = {
  deepseek: "bg-blue-700 text-blue-100",
  "gpt-5-mini": "bg-green-700 text-green-100",
  "claude-sonnet-4": "bg-orange-600 text-orange-100",
  ollama: "bg-purple-700 text-purple-100",
};

const MODEL_LABELS: Record<RoundHistoryModelType, string> = {
  deepseek: "DeepSeek",
  "gpt-5-mini": "GPT",
  "claude-sonnet-4": "Claude",
  ollama: "Ollama",
};

interface ModelBadgeProps {
  model: RoundHistoryModelType;
}

export function ModelBadge({ model }: ModelBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${MODEL_BADGE_STYLES[model]}`}
    >
      {MODEL_LABELS[model]}
    </span>
  );
}
