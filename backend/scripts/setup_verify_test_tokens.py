import sys
import os
from datetime import timedelta

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import users
from app.models.documents import new_user_document
from app.utils.security import hash_password, hash_one_time_token
from app.utils.serializers import utc_now

def setup_test_users():
    # 1. Fresh unverified teacher
    fresh_email = "teacher.fresh.verify@srhu.edu.in"
    fresh_token = "fresh_valid_token_1234567890abcdef"
    users.delete_many({"email": {"$in": [
        fresh_email,
        "teacher.expired.verify@srhu.edu.in",
        "teacher.verified.verify@srhu.edu.in"
    ]}})

    now = utc_now()

    # User 1: Fresh unverified
    user1 = new_user_document(
        name="Fresh Teacher",
        email=fresh_email,
        password_hash=hash_password("Teacher@123"),
        role="teacher",
        email_verified=False,
    )
    user1.update({
        "verification_token_hash": hash_one_time_token(fresh_token),
        "verification_expires_at": now + timedelta(hours=24),
    })
    users.insert_one(user1)

    # User 2: Expired token
    expired_email = "teacher.expired.verify@srhu.edu.in"
    expired_token = "expired_token_1234567890abcdef"
    user2 = new_user_document(
        name="Expired Teacher",
        email=expired_email,
        password_hash=hash_password("Teacher@123"),
        role="teacher",
        email_verified=False,
    )
    user2.update({
        "verification_token_hash": hash_one_time_token(expired_token),
        "verification_expires_at": now - timedelta(hours=2),
    })
    users.insert_one(user2)

    # User 3: Already verified
    verified_email = "teacher.verified.verify@srhu.edu.in"
    verified_token = "already_verified_token_1234567890"
    user3 = new_user_document(
        name="Verified Teacher",
        email=verified_email,
        password_hash=hash_password("Teacher@123"),
        role="teacher",
        email_verified=True,
    )
    user3.update({
        "email_verified_at": now - timedelta(days=1),
        "verification_token_hash": hash_one_time_token(verified_token),
        "verification_expires_at": None,
    })
    users.insert_one(user3)

    print("SUCCESS_SETUP")
    print(f"FRESH_TOKEN={fresh_token}")
    print(f"EXPIRED_TOKEN={expired_token}")
    print(f"VERIFIED_TOKEN={verified_token}")

if __name__ == "__main__":
    setup_test_users()
