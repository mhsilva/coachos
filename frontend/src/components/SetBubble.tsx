export type SetStatus = 'pending' | 'active' | 'done'

interface Props {
  setNumber: number
  status: SetStatus
  onClick?: () => void
}

const styles: Record<SetStatus, string> = {
  pending: 'bg-gray text-teal/40 border-transparent',
  active:  'bg-copper text-white border-copper shadow-btn',
  done:    'bg-teal  text-white border-teal',
}

export function SetBubble({ setNumber, status, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={status === 'done'}
      className={`
        w-10 h-10 rounded-full border-2 font-jetbrains text-sm font-medium
        transition-all active:scale-95
        ${styles[status]}
        ${status === 'done' ? 'cursor-default' : 'cursor-pointer'}
      `}
    >
      {setNumber}
    </button>
  )
}
