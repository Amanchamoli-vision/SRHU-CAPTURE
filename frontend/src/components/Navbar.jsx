import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";
import srhuLogo from "../assets/logo-srhu.png";

function Navbar({ title = "Dean Panel", actions = null }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to logout?"
    );

    if (!confirmed) {
      return;
    }

    await supabase.auth.signOut();

    navigate("/login");
  };

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="flex h-18 sm:h-20 items-center justify-between px-6">

        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-xl bg-white p-1 border border-slate-200 shadow-sm">
            <img src={srhuLogo} alt="SRHU Logo" className="h-full w-full object-contain" />
          </div>
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
            onClick={handleLogout}
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100"
          >
            Logout
          </button>

        </div>

      </div>
    </header>
  );
}

export default Navbar;