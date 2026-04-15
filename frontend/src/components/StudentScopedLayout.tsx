import { useState, type ReactNode } from 'react'
import { CoachAssistantPanel } from './CoachAssistantPanel'

interface Props {
  /** Student id the assistant panel should scope to. */
  studentId: string
  /** Page content — renders in the left column. */
  children: ReactNode
}

/**
 * Shared layout for any coach page that is scoped to a single student:
 * StudentDetail, PlanBuilder, ChatTranscript, etc.
 *
 * Renders the page content on the left and the `CoachAssistantPanel`
 * sticky on the right (lg+). On smaller screens a FAB opens the panel
 * in a fullscreen modal.
 *
 * The panel loads its own student name, so callers only need to pass
 * the student id. The panel's chat state is backed by Redis, so state
 * is preserved across navigations between student-scoped pages.
 */
export function StudentScopedLayout({ studentId, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      <div className="lg:flex lg:max-w-[70rem]">
        <div className="flex-1 min-w-0">{children}</div>

        <aside className="hidden lg:block lg:w-[22rem] lg:shrink-0 lg:pr-6">
          <div className="sticky top-6 h-[calc(100vh-3rem)] py-6">
            <CoachAssistantPanel studentId={studentId} />
          </div>
        </aside>
      </div>

      {/* Mobile/tablet FAB */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="
          lg:hidden fixed right-4 bottom-24 md:right-6 md:bottom-8
          w-14 h-14 rounded-full bg-copper text-white shadow-btn
          flex items-center justify-center
          hover:opacity-90 active:scale-95 transition-all z-30
        "
        aria-label="Abrir assistente IA"
      >
        <span className="text-2xl">✨</span>
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-teal/40 backdrop-blur-sm flex items-stretch"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="w-full h-full p-3 md:p-6 md:max-w-md md:ml-auto"
            onClick={e => e.stopPropagation()}
          >
            <CoachAssistantPanel
              studentId={studentId}
              onClose={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}
