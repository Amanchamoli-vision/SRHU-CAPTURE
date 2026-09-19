import Modal from "../teacher/Modal";
import { IconLogout } from "../teacher/icons";

/**
 * Standard confirmation modal shown before signing out of any role.
 */
export default function LogoutConfirmModal({ open, onClose, onConfirm, loading = false }) {
  return (
    <Modal
      open={open}
      onClose={() => !loading && onClose?.()}
      eyebrow="Confirm"
      title="Log out"
      subtitle="End your current session"
      zIndex={70}
      footer={
        <div className="flex w-full items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="btn btn-ghost btn-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="btn btn-danger btn-sm"
          >
            <IconLogout className="h-4 w-4" />
            {loading ? "Logging out…" : "Yes, Logout"}
          </button>
        </div>
      }
    >
      <div className="flex items-start gap-3.5">
        <span
          className="icon-tile icon-tile-track shrink-0 h-10 w-10 rounded-xl"
          style={{ "--track": "#EF4444" }}
        >
          <IconLogout className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">
            Are you sure you want to logout?
          </p>
          <p className="mt-1 text-xs text-muted leading-relaxed">
            You will be signed out of your account and returned to the login screen. Any unsaved changes may be lost.
          </p>
        </div>
      </div>
    </Modal>
  );
}
