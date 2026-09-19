from __future__ import annotations

import logging
from typing import Any

from pymongo.errors import PyMongoError

from app.database import audit_logs
from app.models.documents import new_audit_log_document

logger = logging.getLogger(__name__)


def log_audit_event(
    *,
    actor: dict[str, Any],
    action: str,
    target_type: str,
    target_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Record an administrative or security-sensitive mutation in the audit log.

    Catches and logs PyMongoError so that an audit logging issue never crashes
    the primary operation.
    """
    try:
        doc = new_audit_log_document(
            actor_id=str(actor.get("id") or actor.get("_id") or ""),
            actor_name=str(actor.get("name") or actor.get("email") or "Unknown"),
            actor_email=str(actor.get("email") or ""),
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id else None,
            details=details or {},
        )
        audit_logs.insert_one(doc)
    except PyMongoError as error:
        logger.error("audit_log_failed action=%s error=%s", action, error)
