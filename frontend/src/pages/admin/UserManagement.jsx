import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase";
import { API_BASE_URL } from "../../services/api";


function UserManagement() {

  const navigate = useNavigate();

  // ==========================================================
  // STATE
  // ==========================================================

  const [users, setUsers] = useState([]);

  const [loading, setLoading] = useState(true);

  const [processingUserId, setProcessingUserId] =
    useState(null);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");


  // ==========================================================
  // LOAD USERS
  // ==========================================================

  const loadUsers = async () => {

    try {

      setLoading(true);
      setError("");

      const {
        data: { session },
      } = await supabase.auth.getSession();


      // -----------------------------------------
      // Check session
      // -----------------------------------------

      if (!session?.access_token) {

        setError(
          "Your session has expired. Please login again."
        );

        navigate("/login");

        return;
      }


      // -----------------------------------------
      // API Request
      // -----------------------------------------

      const response = await fetch(
        `${API_BASE_URL}/admin/users`,
        {
          method: "GET",

          headers: {
            Authorization:
              `Bearer ${session.access_token}`,

            "Content-Type":
              "application/json",
          },
        }
      );


      const data = await response.json();


      if (!response.ok) {

        throw new Error(
          data.detail ||
          "Failed to fetch users"
        );
      }


      setUsers(data.users || []);

    }

    catch (err) {

      console.error(
        "Load users error:",
        err
      );

      setError(
        err.message ||
        "Failed to load users"
      );

    }

    finally {

      setLoading(false);

    }
  };


  // ==========================================================
  // MAKE DEAN
  // ==========================================================

  const handleMakeDean = async (
    userId,
    userName
  ) => {

    const confirmed =
      window.confirm(
        `Are you sure you want to make "${userName}" a Dean?`
      );


    if (!confirmed) {
      return;
    }


    try {

      setProcessingUserId(userId);

      setError("");

      setSuccess("");


      const {
        data: { session },
      } = await supabase.auth.getSession();


      if (!session?.access_token) {

        setError(
          "Your session has expired. Please login again."
        );

        navigate("/login");

        return;
      }


      const response = await fetch(
        `${API_BASE_URL}/admin/users/${userId}/make-dean`,
        {
          method: "PATCH",

          headers: {
            Authorization:
              `Bearer ${session.access_token}`,

            "Content-Type":
              "application/json",
          },
        }
      );


      const data = await response.json();


      if (!response.ok) {

        throw new Error(
          data.detail ||
          "Failed to make user Dean"
        );
      }


      setSuccess(
        data.message ||
        `${userName} is now a Dean.`
      );


      await loadUsers();

    }

    catch (err) {

      console.error(
        "Make Dean error:",
        err
      );

      setError(
        err.message ||
        "Failed to make user Dean"
      );

    }

    finally {

      setProcessingUserId(null);

    }
  };


  // ==========================================================
  // MAKE TEACHER
  // ==========================================================

  const handleMakeTeacher = async (
    userId,
    userName
  ) => {

    const confirmed =
      window.confirm(
        `Are you sure you want to change "${userName}" back to Teacher?`
      );


    if (!confirmed) {
      return;
    }


    try {

      setProcessingUserId(userId);

      setError("");

      setSuccess("");


      const {
        data: { session },
      } = await supabase.auth.getSession();


      if (!session?.access_token) {

        setError(
          "Your session has expired. Please login again."
        );

        navigate("/login");

        return;
      }


      const response = await fetch(
        `${API_BASE_URL}/admin/users/${userId}/make-teacher`,
        {
          method: "PATCH",

          headers: {
            Authorization:
              `Bearer ${session.access_token}`,

            "Content-Type":
              "application/json",
          },
        }
      );


      const data = await response.json();


      if (!response.ok) {

        throw new Error(
          data.detail ||
          "Failed to make user Teacher"
        );
      }


      setSuccess(
        data.message ||
        `${userName} is now a Teacher.`
      );


      await loadUsers();

    }

    catch (err) {

      console.error(
        "Make Teacher error:",
        err
      );

      setError(
        err.message ||
        "Failed to make user Teacher"
      );

    }

    finally {

      setProcessingUserId(null);

    }
  };


  // ==========================================================
  // DELETE USER
  // ==========================================================

  const handleDeleteUser = async (
    userId,
    userName,
    userEmail
  ) => {

    const displayName =
      userName ||
      userEmail ||
      "this user";


    const confirmed =
      window.confirm(
        `Are you sure you want to permanently delete "${displayName}"?\n\n` +
        `This will delete the user's account and cannot be undone.`
      );


    if (!confirmed) {
      return;
    }


    try {

      setProcessingUserId(userId);

      setError("");

      setSuccess("");


      const {
        data: { session },
      } = await supabase.auth.getSession();


      if (!session?.access_token) {

        setError(
          "Your session has expired. Please login again."
        );

        navigate("/login");

        return;
      }


      const response = await fetch(
        `${API_BASE_URL}/admin/users/${userId}`,
        {
          method: "DELETE",

          headers: {
            Authorization:
              `Bearer ${session.access_token}`,

            "Content-Type":
              "application/json",
          },
        }
      );


      const data = await response.json();


      if (!response.ok) {

        throw new Error(
          data.detail ||
          "Failed to delete user"
        );
      }


      setSuccess(
        data.message ||
        "User deleted successfully."
      );


      await loadUsers();

    }

    catch (err) {

      console.error(
        "Delete user error:",
        err
      );

      setError(
        err.message ||
        "Failed to delete user"
      );

    }

    finally {

      setProcessingUserId(null);

    }
  };


  // ==========================================================
  // LOGOUT
  // ==========================================================

  const handleLogout = async () => {

    await supabase.auth.signOut();

    navigate("/login");

  };


  // ==========================================================
  // LOAD USERS ON PAGE LOAD
  // ==========================================================

  useEffect(() => {

    loadUsers();

  }, []);


  // ==========================================================
  // ROLE BADGE
  // ==========================================================

  const getRoleBadge = (role) => {

    if (role === "admin") {

      return (
        <span
          className="
            inline-flex
            rounded-full
            bg-red-100
            px-3
            py-1
            text-xs
            font-semibold
            text-red-700
          "
        >
          Admin
        </span>
      );
    }


    if (role === "dean") {

      return (
        <span
          className="
            inline-flex
            rounded-full
            bg-purple-100
            px-3
            py-1
            text-xs
            font-semibold
            text-purple-700
          "
        >
          Dean
        </span>
      );
    }


    return (
      <span
        className="
          inline-flex
          rounded-full
          bg-blue-100
          px-3
          py-1
          text-xs
          font-semibold
          text-blue-700
        "
      >
        Teacher
      </span>
    );
  };


  // ==========================================================
  // UI
  // ==========================================================

  return (

    <div className="min-h-screen bg-slate-50">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <header
        className="
          border-b
          border-slate-200
          bg-white
        "
      >

        <div
          className="
            flex
            h-16
            items-center
            justify-between
            px-6
          "
        >

          <div>

            <h1
              className="
                text-xl
                font-bold
                text-slate-800
              "
            >
              Campus Capture
            </h1>

            <p
              className="
                text-sm
                text-slate-500
              "
            >
              Admin Panel
            </p>

          </div>


          <button
            onClick={handleLogout}
            className="
              rounded-lg
              bg-slate-800
              px-4
              py-2
              text-sm
              font-medium
              text-white
              transition
              hover:bg-slate-700
            "
          >
            Logout
          </button>

        </div>

      </header>


      {/* ======================================================
          MAIN
      ====================================================== */}

      <main
        className="
          mx-auto
          max-w-7xl
          px-6
          py-8
        "
      >

        {/* ====================================================
            TITLE
        ==================================================== */}

        <div
          className="
            mb-6
            flex
            flex-col
            justify-between
            gap-4
            sm:flex-row
            sm:items-center
          "
        >

          <div>

            <h2
              className="
                text-2xl
                font-bold
                text-slate-800
              "
            >
              User Management
            </h2>

            <p
              className="
                mt-1
                text-sm
                text-slate-500
              "
            >
              Manage teachers, deans and administrators.
            </p>

          </div>


          <button
            onClick={loadUsers}
            disabled={loading}
            className="
              rounded-lg
              border
              border-slate-300
              bg-white
              px-4
              py-2
              text-sm
              font-medium
              text-slate-700
              transition
              hover:bg-slate-100
              disabled:cursor-not-allowed
              disabled:opacity-50
            "
          >
            {loading
              ? "Refreshing..."
              : "Refresh"}
          </button>

        </div>


        {/* ====================================================
            SUCCESS MESSAGE
        ==================================================== */}

        {success && (

          <div
            className="
              mb-5
              flex
              items-center
              justify-between
              rounded-lg
              border
              border-green-200
              bg-green-50
              px-4
              py-3
              text-sm
              text-green-700
            "
          >

            <span>
              {success}
            </span>


            <button
              onClick={() => setSuccess("")}
              className="
                ml-4
                font-bold
                text-green-700
                hover:text-green-900
              "
            >
              ×
            </button>

          </div>

        )}


        {/* ====================================================
            ERROR MESSAGE
        ==================================================== */}

        {error && (

          <div
            className="
              mb-5
              flex
              items-center
              justify-between
              rounded-lg
              border
              border-red-200
              bg-red-50
              px-4
              py-3
              text-sm
              text-red-700
            "
          >

            <span>
              {error}
            </span>


            <button
              onClick={() => setError("")}
              className="
                ml-4
                font-bold
                text-red-700
                hover:text-red-900
              "
            >
              ×
            </button>

          </div>

        )}


        {/* ====================================================
            USER COUNT
        ==================================================== */}

        {!loading && (

          <div className="mb-4">

            <p
              className="
                text-sm
                text-slate-500
              "
            >

              Total Users:{" "}

              <span
                className="
                  font-semibold
                  text-slate-800
                "
              >
                {users.length}
              </span>

            </p>

          </div>

        )}


        {/* ====================================================
            LOADING
        ==================================================== */}

        {loading ? (

          <div
            className="
              rounded-xl
              border
              border-slate-200
              bg-white
              p-12
              text-center
              shadow-sm
            "
          >

            <div
              className="
                mx-auto
                mb-4
                h-8
                w-8
                animate-spin
                rounded-full
                border-4
                border-slate-200
                border-t-slate-700
              "
            />

            <p
              className="
                text-sm
                text-slate-500
              "
            >
              Loading users...
            </p>

          </div>


        ) : users.length === 0 ? (

          /* ==================================================
             NO USERS
          ================================================== */

          <div
            className="
              rounded-xl
              border
              border-slate-200
              bg-white
              p-12
              text-center
              shadow-sm
            "
          >

            <h3
              className="
                text-lg
                font-semibold
                text-slate-800
              "
            >
              No users found
            </h3>

            <p
              className="
                mt-2
                text-sm
                text-slate-500
              "
            >
              There are no registered users in the system.
            </p>

          </div>


        ) : (

          /* ==================================================
             USERS TABLE
          ================================================== */

          <div
            className="
              overflow-hidden
              rounded-xl
              border
              border-slate-200
              bg-white
              shadow-sm
            "
          >

            <div className="overflow-x-auto">

              <table
                className="
                  w-full
                  min-w-[950px]
                "
              >

                {/* ============================================
                    TABLE HEADER
                ============================================ */}

                <thead
                  className="
                    border-b
                    border-slate-200
                    bg-slate-50
                  "
                >

                  <tr>

                    <th
                      className="
                        px-6
                        py-4
                        text-left
                        text-xs
                        font-semibold
                        uppercase
                        tracking-wide
                        text-slate-500
                      "
                    >
                      Name
                    </th>


                    <th
                      className="
                        px-6
                        py-4
                        text-left
                        text-xs
                        font-semibold
                        uppercase
                        tracking-wide
                        text-slate-500
                      "
                    >
                      Email
                    </th>


                    <th
                      className="
                        px-6
                        py-4
                        text-left
                        text-xs
                        font-semibold
                        uppercase
                        tracking-wide
                        text-slate-500
                      "
                    >
                      Role
                    </th>


                    <th
                      className="
                        px-6
                        py-4
                        text-right
                        text-xs
                        font-semibold
                        uppercase
                        tracking-wide
                        text-slate-500
                      "
                    >
                      Action
                    </th>

                  </tr>

                </thead>


                {/* ============================================
                    TABLE BODY
                ============================================ */}

                <tbody
                  className="
                    divide-y
                    divide-slate-100
                  "
                >

                  {users.map((user) => {

                    const isProcessing =
                      processingUserId === user.id;


                    return (

                      <tr
                        key={user.id}
                        className="
                          transition
                          hover:bg-slate-50
                        "
                      >

                        {/* ==================================
                            NAME
                        ================================== */}

                        <td className="px-6 py-4">

                          <div
                            className="
                              font-medium
                              text-slate-800
                            "
                          >
                            {user.name ||
                              "Unnamed User"}
                          </div>

                          <div
                            className="
                              mt-1
                              text-xs
                              text-slate-400
                            "
                          >
                            ID: {user.id}
                          </div>

                        </td>


                        {/* ==================================
                            EMAIL
                        ================================== */}

                        <td
                          className="
                            px-6
                            py-4
                            text-sm
                            text-slate-600
                          "
                        >
                          {user.email}
                        </td>


                        {/* ==================================
                            ROLE
                        ================================== */}

                        <td className="px-6 py-4">

                          {getRoleBadge(
                            user.role
                          )}

                        </td>


                        {/* ==================================
                            ACTION
                        ================================== */}

                        <td
                          className="
                            px-6
                            py-4
                            text-right
                          "
                        >

                          <div
                            className="
                              flex
                              justify-end
                              gap-2
                            "
                          >

                            {/* ==============================
                                TEACHER
                            ============================== */}

                            {user.role ===
                              "teacher" && (

                              <button
                                onClick={() =>
                                  handleMakeDean(
                                    user.id,
                                    user.name ||
                                      user.email
                                  )
                                }
                                disabled={
                                  isProcessing
                                }
                                className="
                                  rounded-lg
                                  bg-purple-600
                                  px-4
                                  py-2
                                  text-sm
                                  font-medium
                                  text-white
                                  transition
                                  hover:bg-purple-700
                                  disabled:cursor-not-allowed
                                  disabled:opacity-50
                                "
                              >
                                {isProcessing
                                  ? "Updating..."
                                  : "Make Dean"}
                              </button>

                            )}


                            {/* ==============================
                                DEAN
                            ============================== */}

                            {user.role ===
                              "dean" && (

                              <button
                                onClick={() =>
                                  handleMakeTeacher(
                                    user.id,
                                    user.name ||
                                      user.email
                                  )
                                }
                                disabled={
                                  isProcessing
                                }
                                className="
                                  rounded-lg
                                  bg-blue-600
                                  px-4
                                  py-2
                                  text-sm
                                  font-medium
                                  text-white
                                  transition
                                  hover:bg-blue-700
                                  disabled:cursor-not-allowed
                                  disabled:opacity-50
                                "
                              >
                                {isProcessing
                                  ? "Updating..."
                                  : "Make Teacher"}
                              </button>

                            )}


                            {/* ==============================
                                DELETE
                            ============================== */}

                            {user.role !==
                              "admin" && (

                              <button
                                onClick={() =>
                                  handleDeleteUser(
                                    user.id,
                                    user.name,
                                    user.email
                                  )
                                }
                                disabled={
                                  isProcessing
                                }
                                className="
                                  rounded-lg
                                  bg-red-600
                                  px-4
                                  py-2
                                  text-sm
                                  font-medium
                                  text-white
                                  transition
                                  hover:bg-red-700
                                  disabled:cursor-not-allowed
                                  disabled:opacity-50
                                "
                              >
                                {isProcessing
                                  ? "Deleting..."
                                  : "Delete"}
                              </button>

                            )}


                            {/* ==============================
                                ADMIN
                            ============================== */}

                            {user.role ===
                              "admin" && (

                              <span
                                className="
                                  text-sm
                                  text-slate-400
                                "
                              >
                                No action
                              </span>

                            )}

                          </div>

                        </td>

                      </tr>

                    );

                  })}

                </tbody>

              </table>

            </div>

          </div>

        )}

      </main>

    </div>

  );
}


export default UserManagement;
