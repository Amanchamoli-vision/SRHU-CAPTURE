import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "../services/auth";
import LogoutConfirmModal from "./common/LogoutConfirmModal";
import srhuLogo from "../assets/logo.png";

function Navbar({ title = "Dean Panel", actions = null }) {
  const navigate = useNavigate();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const handleLogout = async () => {
    setLogoutConfirmOpen(false);
    await signOut();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
      <div className="flex h-[76px] items-center justify-between px-6">

        <div className="flex items-center gap-3.5">
          <img
            src={srhuLogo}
            alt="Swami Rama Himalayan University"
            className="h-12 sm:h-14 w-auto object-contain shrink-0"
          />
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">
              Campus Capture
            </h1>
            <p className="text-xs font-medium text-slate-500">
              {title}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">

          {actions}

          <button
            onClick={() => setLogoutConfirmOpen(true)}
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100"
          >
            Logout
          </button>

        </div>

      </div>

      <LogoutConfirmModal
        open={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={handleLogout}
      />
    </header>
  );
}

export default Navbar;