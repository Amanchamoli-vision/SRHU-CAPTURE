from fastapi import APIRouter, HTTPException, Header
from app.database import supabase


router = APIRouter(
    prefix="/admin",
    tags=["Admin"]
)


# ============================================================
# ADMIN AUTHENTICATION
# ============================================================

def get_admin_user(authorization: str | None):
    """
    Verify the Supabase access token and make sure
    the logged-in user has admin role.
    """

    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Authorization token required"
        )

    token = authorization.replace("Bearer ", "").strip()

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization token"
        )

    try:
        # Verify Supabase Auth token
        user_response = supabase.auth.get_user(token)

        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=401,
                detail="Invalid authentication token"
            )

        user_id = user_response.user.id

        # Get profile from public.users
        profile_response = (
            supabase
            .table("users")
            .select("id, name, email, role")
            .eq("id", user_id)
            .single()
            .execute()
        )

        profile = profile_response.data

        if not profile:
            raise HTTPException(
                status_code=404,
                detail="User profile not found"
            )

        # Check admin role
        if profile.get("role") != "admin":
            raise HTTPException(
                status_code=403,
                detail="Admin access required"
            )

        return profile

    except HTTPException:
        raise

    except Exception as error:
        print("Admin authentication error:", error)

        raise HTTPException(
            status_code=401,
            detail="Authentication failed"
        )


# ============================================================
# ADMIN DASHBOARD STATS
# ============================================================

@router.get("/dashboard/stats")
def get_dashboard_stats(
    authorization: str | None = Header(default=None)
):

    try:
        # Verify admin
        get_admin_user(authorization)

        # -----------------------------------------
        # Users
        # -----------------------------------------

        users_response = (
            supabase
            .table("users")
            .select("id, role")
            .execute()
        )

        users = users_response.data or []

        total_users = len(users)

        teachers = sum(
            1
            for user in users
            if user.get("role") == "teacher"
        )

        deans = sum(
            1
            for user in users
            if user.get("role") == "dean"
        )

        admins = sum(
            1
            for user in users
            if user.get("role") == "admin"
        )

        # -----------------------------------------
        # Pending Events
        # -----------------------------------------

        events_response = (
            supabase
            .table("events")
            .select("id")
            .eq("status", "pending")
            .execute()
        )

        pending_events = len(
            events_response.data or []
        )

        return {
            "success": True,
            "total_users": total_users,
            "teachers": teachers,
            "deans": deans,
            "admins": admins,
            "pending_events": pending_events
        }

    except HTTPException:
        raise

    except Exception as error:
        print("Dashboard stats error:", error)

        raise HTTPException(
            status_code=500,
            detail="Failed to fetch dashboard statistics"
        )


# ============================================================
# GET ALL USERS
# ============================================================

@router.get("/users")
def get_all_users(
    authorization: str | None = Header(default=None)
):

    try:
        # Verify admin
        get_admin_user(authorization)

        response = (
            supabase
            .table("users")
            .select(
                """
                id,
                name,
                email,
                role,
                created_at,
                updated_at
                """
            )
            .order(
                "created_at",
                desc=True
            )
            .execute()
        )

        users = response.data or []

        return {
            "success": True,
            "users": users,
            "total": len(users)
        }

    except HTTPException:
        raise

    except Exception as error:
        print("Get users error:", error)

        raise HTTPException(
            status_code=500,
            detail="Failed to fetch users"
        )


# ============================================================
# MAKE TEACHER → DEAN
# ============================================================

@router.patch("/users/{user_id}/make-dean")
def make_user_dean(
    user_id: str,
    authorization: str | None = Header(default=None)
):

    try:
        # Verify admin
        get_admin_user(authorization)

        # Find user
        user_response = (
            supabase
            .table("users")
            .select(
                """
                id,
                name,
                email,
                role
                """
            )
            .eq("id", user_id)
            .single()
            .execute()
        )

        user = user_response.data

        if not user:
            raise HTTPException(
                status_code=404,
                detail="User not found"
            )

        # Only Teacher can become Dean
        if user.get("role") != "teacher":
            raise HTTPException(
                status_code=400,
                detail="Only a teacher can be made Dean"
            )

        # Update role
        update_response = (
            supabase
            .table("users")
            .update({
                "role": "dean"
            })
            .eq("id", user_id)
            .execute()
        )

        if not update_response.data:
            raise HTTPException(
                status_code=500,
                detail="Failed to update user role"
            )

        updated_user = update_response.data[0]

        return {
            "success": True,
            "message": (
                f"{updated_user.get('name')} "
                f"has been made Dean successfully"
            ),
            "user": updated_user
        }

    except HTTPException:
        raise

    except Exception as error:
        print("Make Dean error:", error)

        raise HTTPException(
            status_code=500,
            detail="Failed to make user Dean"
        )


# ============================================================
# MAKE DEAN → TEACHER
# ============================================================

@router.patch("/users/{user_id}/make-teacher")
def make_user_teacher(
    user_id: str,
    authorization: str | None = Header(default=None)
):

    try:
        # Verify admin
        get_admin_user(authorization)

        # Find user
        user_response = (
            supabase
            .table("users")
            .select(
                """
                id,
                name,
                email,
                role
                """
            )
            .eq("id", user_id)
            .single()
            .execute()
        )

        user = user_response.data

        if not user:
            raise HTTPException(
                status_code=404,
                detail="User not found"
            )

        # Only Dean can become Teacher
        if user.get("role") != "dean":
            raise HTTPException(
                status_code=400,
                detail="Only a Dean can be changed to Teacher"
            )

        # Update role
        update_response = (
            supabase
            .table("users")
            .update({
                "role": "teacher"
            })
            .eq("id", user_id)
            .execute()
        )

        if not update_response.data:
            raise HTTPException(
                status_code=500,
                detail="Failed to update user role"
            )

        updated_user = update_response.data[0]

        return {
            "success": True,
            "message": (
                f"{updated_user.get('name')} "
                f"has been changed to Teacher"
            ),
            "user": updated_user
        }

    except HTTPException:
        raise

    except Exception as error:
        print("Make Teacher error:", error)

        raise HTTPException(
            status_code=500,
            detail="Failed to make user Teacher"
        )


# ============================================================
# DELETE USER
# ============================================================

@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    authorization: str | None = Header(default=None)
):

    try:
        # -----------------------------------------
        # Verify Admin
        # -----------------------------------------

        admin_profile = get_admin_user(authorization)

        # -----------------------------------------
        # Prevent admin from deleting himself
        # -----------------------------------------

        if admin_profile.get("id") == user_id:
            raise HTTPException(
                status_code=400,
                detail="You cannot delete your own admin account"
            )

        # -----------------------------------------
        # Find user
        # -----------------------------------------

        user_response = (
            supabase
            .table("users")
            .select(
                """
                id,
                name,
                email,
                role
                """
            )
            .eq("id", user_id)
            .single()
            .execute()
        )

        user = user_response.data

        if not user:
            raise HTTPException(
                status_code=404,
                detail="User not found"
            )

        # -----------------------------------------
        # Extra safety:
        # Admin cannot delete another admin
        # -----------------------------------------

        if user.get("role") == "admin":
            raise HTTPException(
                status_code=403,
                detail="Admin users cannot be deleted"
            )

        # -----------------------------------------
        # Delete from Supabase Auth
        # -----------------------------------------

        supabase.auth.admin.delete_user(user_id)

        # Because public.users.id references
        # auth.users(id) with ON DELETE CASCADE,
        # public.users will also be deleted.
        #
        # Related events will also be deleted because:
        #
        # events.teacher_id
        # REFERENCES users(id)
        # ON DELETE CASCADE

        return {
            "success": True,
            "message": (
                f"{user.get('name') or user.get('email')} "
                f"has been deleted successfully"
            ),
            "user": user
        }

    except HTTPException:
        raise

    except Exception as error:
        print("Delete user error:", error)

        raise HTTPException(
            status_code=500,
            detail="Failed to delete user"
        )