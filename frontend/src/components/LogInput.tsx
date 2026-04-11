interface Props {
  weight: string
  reps: string
  onWeightChange: (v: string) => void
  onRepsChange: (v: string) => void
  onConfirm: () => void
  loading?: boolean
}

export function LogInput({
  weight,
  reps,
  onWeightChange,
  onRepsChange,
  onConfirm,
  loading = false,
}: Props) {
  return (
    <div className="flex items-end gap-3 mt-4 pt-4 border-t border-teal/[0.06]">
      <div className="flex-1">
        <label className="block text-xs text-teal/50 mb-1.5">Carga (kg)</label>
        <input
          type="number"
          inputMode="decimal"
          value={weight}
          onChange={e => onWeightChange(e.target.value)}
          placeholder="0.0"
          className="
            w-full border border-teal/[0.15] rounded-btn px-3 py-2.5
            font-jetbrains text-sm text-teal
            focus:outline-none focus:border-copper
            transition-colors
          "
        />
      </div>

      <div className="flex-1">
        <label className="block text-xs text-teal/50 mb-1.5">Reps feitas</label>
        <input
          type="number"
          inputMode="numeric"
          value={reps}
          onChange={e => onRepsChange(e.target.value)}
          placeholder="0"
          className="
            w-full border border-teal/[0.15] rounded-btn px-3 py-2.5
            font-jetbrains text-sm text-teal
            focus:outline-none focus:border-copper
            transition-colors
          "
        />
      </div>

      <button
        type="button"
        onClick={onConfirm}
        disabled={loading}
        className="
          bg-copper text-white rounded-btn px-5 py-2.5
          text-sm font-medium shadow-btn
          hover:opacity-90 active:scale-95
          transition-all disabled:opacity-40
        "
      >
        OK
      </button>
    </div>
  )
}
