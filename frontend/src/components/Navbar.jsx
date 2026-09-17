import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";
import srhuLogo from "../assets/srhu-logo-light.png";

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
      <div className="flex h-20 sm:h-24 items-center justify-between px-6">

        <div className="flex items-center gap-3.5">
          <img
            src={srhuLogo}
            alt="Swami Rama Himalayan University"
            className="h-14 sm:h-18 w-auto object-contain"
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