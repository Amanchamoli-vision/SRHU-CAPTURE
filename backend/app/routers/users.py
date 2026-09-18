from fastapi import APIRouter, Header, HTTPException, status

from app.database import users
from app.schemas.auth import ChangePasswordRequest, UpdateProfileRequest
from app.utils.auth import get_current_user, public_user
from app.utils.security import hash_password, verify_password
from app.utils.serializers import to_object_id, utc_now


router = APIRouter(prefix="/users", tags=["Users"])


# ============================================================
# CURRENT USER PROFILE
# ============================================================

@router.get("/me")
def get_my_profile(authorization: str | None = Header(default=None)):
    user = get_current_user(authorization)
    return {"success": True, "user": user}


@router.patch("/me")
def update_my_profile(
    payload: UpdateProfileRequest,
    authorization: str | None = Header(default=None),
):
    user = get_current_user(authorization)

    updated = users.find_one_and_update(
        {"_id": to_object_id(user["id"])},
        {"$set": {"name": payload.name, "updated_at": utc_now()}},
        return_document=True,
    )

    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found",
        )

    return {
        "success": True,
        "message": "Profile updated successfully",
        "user": public_user(updated),
    }


@router.post("/me/change-password")
def change_my_password(
    payload: ChangePasswordRequest,
    authorization: str | None = Header(default=None),
):
    user = get_current_user(authorization)
    document = users.find_one({"_id": to_object_id(user["id"])})

    if not document or not verify_password(
        payload.current_password, document.get("password_hash")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    users.update_one(
        {"_id": document["_id"]},
        {
            "$set": {
                "password_hash": hash_password(payload.new_password),
                "updated_at": utc_now(),
            }
        },
    )

    return {"success": True, "message": "Password changed successfully"}
