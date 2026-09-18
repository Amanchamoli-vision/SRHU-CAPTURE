"""Request authentication and role checks backed by MongoDB."""

import logging

import jwt
from fastapi import HTTPException, status

from app.database import users
from app.models.documents import USER_PRIVATE_FIELDS
from app.utils.security import decode_access_token
from app.utils.serializers import serialize, to_object_id


logger = logging.getLogger(__name__)


def public_user(document: dict | None) -> dict | None:
    """Serialize a user document without any credential fields."""
    return serialize(document, exclude=USER_PRIVATE_FIELDS)


def extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token required",
        )

    scheme, _, token = authorization.strip().partition(" ")
    token = token.strip()

    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization token",
        )

    return token


def get_current_user(authorization: str | None) -> dict:
    """Validate the bearer token and load the matching user from MongoDB."""
    token = extract_bearer_token(authorization)

    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please login again.",
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )

    user_object_id = to_object_id(payload.get("sub"))
    if user_object_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )

    document = users.find_one({"_id": user_object_id})
    if not document:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists",
        )

    return public_user(document)


def require_role(user: dict, *roles: str) -> dict:
    if user.get("role") not in roles:
        label = " or ".join(role.capitalize() for role in roles)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{label} access required",
        )
    return user


def check_dean(user: dict) -> dict:
    return require_role(user, "dean")


def get_superadmin_user(authorization: str | None) -> dict:
    return require_role(get_current_user(authorization), "superadmin")
