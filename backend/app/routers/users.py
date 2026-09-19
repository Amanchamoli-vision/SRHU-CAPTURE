from fastapi import APIRouter, Header, HTTPException, status
from pymongo import ReturnDocument

from app.database import users
from app.schemas.auth import ChangePasswordRequest, UpdateProfileRequest
from app.utils.auth import get_current_user, public_user, stored_token_version
from app.utils.security import create_access_token, hash_password, verify_password
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

    update_fields: dict = {
        "name": payload.name,
        "updated_at": utc_now(),
    }

    # Department and Mobile Number apply to Teacher and Dean roles only (not Super Admin)
    if user.get("role") in ("teacher", "dean"):
        update_fields["phone"] = payload.phone
        update_fields["department"] = payload.department

    updated = users.find_one_and_update(
        {"_id": to_object_id(user["id"])},
        {"$set": update_fields},
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

    # Bumping token_version signs out every other session (a stolen token stops
    # working); clearing the reset fields stops an older reset link from
    # overriding the password just chosen; must_change_password is the flag a
    # Dean created with a temporary password carries until this point.
    updated = users.find_one_and_update(
        {"_id": document["_id"], "password_hash": document.get("password_hash")},
        {
            "$set": {
                "password_hash": hash_password(payload.new_password),
                "must_change_password": False,
                "reset_token_hash": None,
                "reset_expires_at": None,
                "updated_at": utc_now(),
            },
            "$inc": {"token_version": 1},
        },
        return_document=ReturnDocument.AFTER,
    )

    if not updated:
        # The password changed between the check above and this write.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    # The caller's own token was just invalidated along with every other one,
    # so hand back a fresh session for this device. Clients that ignore these
    # fields simply get sent to sign in again.
    token, expires_in = create_access_token(
        str(updated["_id"]),
        updated["role"],
        token_version=stored_token_version(updated),
    )
    return {
        "success": True,
        "message": "Password changed successfully",
        "access_token": token,
        "token_type": "bearer",
        "expires_in": expires_in,
        "user": public_user(updated),
    }
