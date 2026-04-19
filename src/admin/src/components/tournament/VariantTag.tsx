/**
 * VariantTag — 프롬프트 변형 태그 (ADR 45 §5.2)
 */
import type { VariantType } from "@/lib/types";

const VARIANT_TAG_STYLES: Record<VariantType, string> = {
  v1: "bg-slate-600 text-slate-200",
  v2: "bg-slate-500 text-slate-100",
  "v2-zh": "bg-cyan-700 text-cyan-100",
  v3: "bg-teal-700 text-teal-100",
  v4: "bg-amber-600 text-amber-100",
  "v4.1": "bg-yellow-600 text-yellow-100",
  v5: "bg-rose-700 text-rose-100",
  "v5.1": "bg-pink-700 text-pink-100",
};

interface VariantTagProps {
  variant: VariantType;
}

export function VariantTag({ variant }: VariantTagProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${VARIANT_TAG_STYLES[variant]}`}
    >
      {variant}
    </span>
  );
}
