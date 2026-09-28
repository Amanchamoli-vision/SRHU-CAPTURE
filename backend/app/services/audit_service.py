from __future__ import annotations

import json
import logging
from typing import Any

from pymongo.errors import PyMongoError

from app.database import audit_logs
from app.logging_config import AUDIT_LOGGER
from app.models.documents import new_audit_log_document

logger = logging.getLogger(__name__)
audit_file_logger = logging.getLogger(AUDIT_LOGGER)


def _write_audit_line(doc: dict[str, Any]) -> None:
    """One JSON line per action in audit.log -- the file-based audit trail."""
    try:
        audit_file_logger.info(
            json.dumps(
                {key: value for key, value in doc.items() if key != "_id"},
                default=str,
                ensure_ascii=False,
                separators=(",", ":"),
            )
        )
    except Exception as error:  # never let logging break the operation
        logger.error("audit_file_log_failed action=%s error=%s", doc.get("action"), error)


def log_audit_event(
    *,
    actor: dict[str, Any],
    action: str,
    target_type: str,
    target_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Record an administrative or security-sensitive mutation in the audit log.

    Every action is written to ``audit.log`` (rotating file). The same record is
    kept in the ``audit_logs`` collection because it is application data, not
    just a log: the Super Admin Audit Logs page and the Dean's Recent Activity
    panel are built from it.

    Catches and logs PyMongoError so that an audit logging issue never crashes
    the primary operation.
    """
    doc = new_audit_log_document(
        actor_id=str(actor.get("id") or actor.get("_id") or ""),
        actor_name=str(actor.get("name") or actor.get("email") or "Unknown"),
        actor_email=str(actor.get("email") or ""),
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id else None,
        details=details or {},
    )
    _write_audit_line(doc)
    try:
        audit_logs.insert_one(doc)
    except PyMongoError as error:
        logger.error("audit_log_failed action=%s error=%s", action, error)
