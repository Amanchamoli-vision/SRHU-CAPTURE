"""Event Manager role: the Teacher panel's event API, without the Dean.

The Event Manager uses the Teacher panel's screens (frontend
components/teacher/panel.jsx), so this router mirrors the teacher endpoints in
routers/events.py path for path and response for response -- ``/event-manager``
in place of ``/teacher`` -- with one difference: there is no review. Where a
teacher's submission goes to the Dean as ``pending``, an Event Manager's is
``recorded`` at once; nothing is announced to anyone, and a recorded event
stays editable.

On top of that, reports: one event, or several in one PDF, generated directly,
with up to four chosen photos and a download link for every file.

The events live in their own collections (`managed_events`,
`managed_event_media`, `managed_event_documents`), so the teacher, Dean and
superadmin flows never see them.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from pymongo import ASCENDING, DESCENDING

from app.config import settings
from app.database import fs, managed_event_documents, managed_event_media, managed_events
from app.models.documents import (
    new_document_document,
    new_history_entry,
    new_media_document,
    upload_name_key,
)
from app.routers.events import (
    _cap_error,
    _ensure_bytes_under_cap,
    _ensure_under_cap,
    _size_cap_error,
    paginate,
)
from app.schemas.event_manager import (
    ManagedBulkDeleteRequest,
    ManagedReportRequest,
    ReportPhotosRequest,
)
from app.schemas.events import EventCreateRequest, EventUpdateRequest
from app.services import report_files
from app.services.event_fields import many_with_legacy_metadata, with_legacy_metadata
from app.services.event_types import resolve_event_type
from app.services.managed_report_pdf import (
    Attachment,
    ReportEntry,
    build_managed_report_pdf,
    prepare_photo,
)
from app.services.report_pdf import split_description
from app.services.storage_service import (
    absolute_url,
    absolutize,
    check_file_signature,
    content_disposition,
    delete_stored,
    inspect_document,
    inspect_media,
    peek_head,
    safe_file_name,
    save_upload,
    stream_upload,
)
from app.services.upload_config_service import REQUIREMENT_FIELDS, get_upload_limits
from app.utils.file_names import report_file_name
from app.utils.auth import get_current_user, require_role
from app.utils.serializers import serialize, serialize_many, to_object_id, utc_now


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/event-manager", tags=["Event Manager"])

ROLE = "event_manager"
RECORDED = "recorded"


def manager_dep(authorization: str | None = Header(default=None)) -> dict:
    return require_role(get_current_user(authorization), ROLE)


# ============================================================
# HELPERS
# ============================================================

def _own_event_or_404(event_id: str, user: dict) -> dict:
    object_id = to_object_id(event_id)
    event = managed_events.find_one({"_id": object_id, "owner_id": user["id"]}) if object_id else None
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _list_media(request: Request, event_key: str) -> list[dict]:
    cursor = managed_event_media.find({"event_id": event_key}).sort("created_at", ASCENDING)
    return [absolutize(request, item, "media_url") for item in serialize_many(cursor)]


def _list_documents(request: Request, event_key: str) -> list[dict]:
    cursor = managed_event_documents.find({"event_id": event_key}).sort("created_at", ASCENDING)
    return [absolutize(request, item, "file_url") for item in serialize_many(cursor)]


def _report_photo_ids(event: dict) -> list[str]:
    """The photos the report shows: the saved choice, or the first MAX_REPORT_PHOTOS."""
    return report_files.report_photo_ids(event, managed_event_media)


def _evidence(label: str) -> tuple:
    if label == "document":
        return managed_event_documents, {}
    return managed_event_media, {"media_type": "image" if label == "photo" else "video"}


def _ensure_recordable(event: dict) -> None:
    """The teacher's evidence rule (ensure_submittable): whichever kinds the
    Super Admin marked mandatory must be attached before the event is saved."""
    event_key = str(event["_id"])
    limits = get_upload_limits()
    for label, flag in REQUIREMENT_FIELDS.items():
        if not limits.get(flag):
            continue
        collection, query = _evidence(label)
        if collection.count_documents({"event_id": event_key, **query}) < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"At least one {label} is required before saving the event.",
            )


def _event_values(payload: EventCreateRequest, user: dict) -> dict:
    return {
        "event_name": payload.event_name,
        "event_date": payload.event_date,
        "end_date": payload.end_date,
        "event_type": resolve_event_type(payload.event_type, created_by=user["id"]),
        "location": payload.location,
        "description": payload.description,
        "social_network_url": payload.social_network_url,
        "start_time": payload.start_time,
        "end_time": payload.end_time,
        "organizer": payload.organizer,
        "coordinator_contact": payload.coordinator_contact,
    }


def _public_event(event: dict) -> dict:
    item = with_legacy_metadata(serialize(dict(event)))
    report_files.with_report_photos(item, event, managed_event_media)
    return item


# ============================================================
# EVENTS (mirrors /teacher/events)
# ============================================================

@router.get("/events")
def list_events(
    skip: int | None = Query(default=None, ge=0),
    limit: int | None = Query(default=None, ge=1, le=1000),
    user: dict = Depends(manager_dep),
):
    event_list, total = paginate(
        managed_events, {"owner_id": user["id"]}, "created_at", DESCENDING, skip, limit
    )
    many_with_legacy_metadata(event_list)
    return {
        "success": True,
        "events": event_list,
        "total": total,
        "count": len(event_list),
        "has_more": (skip or 0) + len(event_list) < total,
        "skip": skip or 0,
        "limit": limit,
    }


@router.post("/events", status_code=status.HTTP_201_CREATED)
def create_event(payload: EventCreateRequest, user: dict = Depends(manager_dep)):
    # As for teachers: save a draft, attach the files, then save it for real.
    if not payload.save_as_draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Save the event first, attach its photos and documents, then save it.",
        )
    now = utc_now()
    document = {
        **_event_values(payload, user),
        "owner_id": user["id"],
        "owner_name": user.get("name"),
        "owner_email": user.get("email"),
        "status": "draft",
        "report_photo_ids": None,
        "history": [new_history_entry(action="created", status="draft", actor=user)],
        "created_at": now,
        "updated_at": now,
    }
    document["_id"] = managed_events.insert_one(document).inserted_id
    return {"success": True, "message": "Draft saved", "event": serialize(document)}


@router.post("/events/bulk-delete")
def bulk_delete_events(payload: ManagedBulkDeleteRequest, user: dict = Depends(manager_dep)):
    """Delete the selected events, with their files, in one request.

    Every id is resolved in one query and only the caller's own events are
    touched; the response accounts for each id (deleted, or not found).
    """
    wanted: list[ObjectId] = []
    results: list[dict] = []
    for value in payload.event_ids:
        object_id = to_object_id(value)
        if object_id is None:
            results.append({"event_id": value, "event_name": None, "status": "not_found"})
        elif object_id not in wanted:
            wanted.append(object_id)

    found = {row["_id"]: row for row in managed_events.find(
        {"_id": {"$in": wanted}, "owner_id": user["id"]}, {"event_name": 1}
    )}
    for object_id in wanted:
        row = found.get(object_id)
        results.append({
            "event_id": str(object_id),
            "event_name": row.get("event_name") if row else None,
            "status": "deleted" if row else "not_found",
        })

    ids = list(found)
    keys = [str(object_id) for object_id in ids]
    if ids:
        managed_events.delete_many({"_id": {"$in": ids}, "owner_id": user["id"]})
        for collection in (managed_event_media, managed_event_documents):
            for row in collection.find({"event_id": {"$in": keys}}):
                delete_stored(row)
            collection.delete_many({"event_id": {"$in": keys}})
    logger.info("managed_events_bulk_deleted count=%d owner=%s", len(ids), user["id"])

    deleted = len(ids)
    return {
        "success": True,
        "requested_count": len(results),
        "deleted_count": deleted,
        "not_found_count": len(results) - deleted,
        "results": results,
        "message": f"{deleted} event{'s' if deleted != 1 else ''} deleted permanently.",
    }


@router.get("/events/{event_id}")
def get_event(event_id: str, request: Request, user: dict = Depends(manager_dep)):
    event = _own_event_or_404(event_id, user)
    key = str(event["_id"])
    return {
        "success": True,
        "event": _public_event(event),
        "media": _list_media(request, key),
        "documents": _list_documents(request, key),
    }


@router.patch("/events/{event_id}")
def update_event(event_id: str, payload: EventUpdateRequest, user: dict = Depends(manager_dep)):
    """Save a draft (`save_as_draft`), or save the event: recorded at once."""
    event = _own_event_or_404(event_id, user)
    previous = event.get("status")

    if payload.save_as_draft and previous != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This event has already been saved and can no longer be a draft.",
        )

    changes = {**_event_values(payload, user), "updated_at": utc_now()}
    update: dict = {"$set": changes}
    if payload.save_as_draft:
        changes["status"] = "draft"
    else:
        _ensure_recordable(event)
        changes["status"] = RECORDED
        if previous != RECORDED:
            changes["recorded_at"] = utc_now()
        update["$push"] = {
            "history": new_history_entry(
                action=RECORDED if previous != RECORDED else "updated",
                status=RECORDED,
                from_status=previous,
                actor=user,
            )
        }

    updated = managed_events.find_one_and_update(
        {"_id": event["_id"], "owner_id": user["id"]}, update, return_document=True
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return {
        "success": True,
        "message": "Draft saved" if payload.save_as_draft else "Event saved",
        "event": serialize(updated),
    }


@router.delete("/events/{event_id}")
def delete_event(event_id: str, user: dict = Depends(manager_dep)):
    event = _own_event_or_404(event_id, user)
    key = str(event["_id"])
    managed_events.delete_one({"_id": event["_id"]})
    for collection in (managed_event_media, managed_event_documents):
        for row in collection.find({"event_id": key}):
            delete_stored(row)
        collection.delete_many({"event_id": key})
    logger.info("managed_event_deleted id=%s owner=%s", key, user["id"])
    return {"success": True, "message": "Event deleted successfully"}


# ============================================================
# MEDIA AND DOCUMENTS (mirrors /teacher/events/{id}/media|documents)
# ============================================================

def _record(collection, document: dict, stored: dict, cap_query: dict, cap, kind: str, cap_bytes) -> None:
    """Insert the record for bytes just stored; roll both back if a race
    pushed the event past a cap (the later upload loses, as for teachers)."""
    try:
        inserted = collection.insert_one(document).inserted_id
    except Exception:
        delete_stored(stored)
        raise
    document["_id"] = inserted

    def roll_back() -> None:
        collection.delete_one({"_id": inserted})
        delete_stored(stored)

    if cap is not None:
        ids = [row["_id"] for row in collection.find(cap_query, {"_id": 1}).sort("_id", ASCENDING)]
        if inserted in ids[cap:]:
            roll_back()
            raise _cap_error(cap, kind)
    if cap_bytes is not None:
        running = 0
        for row in collection.find(cap_query, {"_id": 1, "file_size": 1}).sort("_id", ASCENDING):
            running += row.get("file_size") or 0
            if row["_id"] == inserted:
                if running > cap_bytes:
                    roll_back()
                    raise _size_cap_error(cap_bytes, kind)
                break


@router.get("/events/{event_id}/media")
def get_media(event_id: str, request: Request, user: dict = Depends(manager_dep)):
    event = _own_event_or_404(event_id, user)
    media = _list_media(request, str(event["_id"]))
    return {"success": True, "event_id": event_id, "media": media, "total": len(media)}


@router.post("/events/{event_id}/media", status_code=status.HTTP_201_CREATED)
def upload_media(
    event_id: str,
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(manager_dep),
):
    event = _own_event_or_404(event_id, user)
    event_key = str(event["_id"])

    info = inspect_media(file)
    media_type = info["kind"]
    is_image = media_type == "image"
    limits = get_upload_limits()
    cap = limits["max_photos_per_event"] if is_image else limits.get("max_videos_per_event")
    cap_bytes = limits["max_photo_total_bytes"] if is_image else limits["max_video_total_bytes"]
    per_file = limits["max_photo_size_bytes"] if is_image else limits["max_video_size_bytes"]
    cap_query = {"event_id": event_key, "media_type": media_type}
    _ensure_under_cap(managed_event_media, cap_query, cap, media_type)

    buffer, size = stream_upload(file, per_file, what="Photos" if is_image else "Videos")
    try:
        check_file_signature(info["extension"], peek_head(buffer))
        _ensure_bytes_under_cap(managed_event_media, cap_query, size, cap_bytes, media_type)
        file_name = safe_file_name(file.filename)
        stored = save_upload(
            buffer, file_name=file_name, content_type=info["content_type"],
            kind="media", event_id=event_key, teacher_id=user["id"],
        )
    finally:
        buffer.close()

    document = new_media_document(
        event_id=event_key, storage=stored["storage"], object_key=stored["object_key"],
        file_id=stored["file_id"], file_name=file_name, media_url=stored["url"],
        media_type=media_type, content_type=info["content_type"], file_size=size,
        original_name=file.filename,
    )
    _record(managed_event_media, document, stored, cap_query, cap, media_type, cap_bytes)
    return {
        "success": True,
        "message": "Media uploaded successfully",
        "media": absolutize(request, serialize(document), "media_url"),
    }


@router.get("/events/{event_id}/documents")
def get_documents(event_id: str, request: Request, user: dict = Depends(manager_dep)):
    event = _own_event_or_404(event_id, user)
    documents = _list_documents(request, str(event["_id"]))
    return {"success": True, "event_id": event_id, "documents": documents, "total": len(documents)}


@router.post("/events/{event_id}/documents", status_code=status.HTTP_201_CREATED)
def upload_document(
    event_id: str,
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(manager_dep),
):
    event = _own_event_or_404(event_id, user)
    event_key = str(event["_id"])

    info = inspect_document(file)
    limits = get_upload_limits()
    cap = limits["max_documents_per_event"]
    cap_bytes = limits["max_documents_total_bytes"]
    cap_query = {"event_id": event_key}
    _ensure_under_cap(managed_event_documents, cap_query, cap, "document")

    buffer, size = stream_upload(file, cap_bytes, what="Documents")
    try:
        check_file_signature(info["extension"], peek_head(buffer))
        _ensure_bytes_under_cap(managed_event_documents, cap_query, size, cap_bytes, "document")
        file_name = safe_file_name(file.filename)
        stored = save_upload(
            buffer, file_name=file_name, content_type=info["content_type"],
            kind="documents", event_id=event_key, teacher_id=user["id"],
        )
    finally:
        buffer.close()

    document = new_document_document(
        event_id=event_key, storage=stored["storage"], object_key=stored["object_key"],
        file_id=stored["file_id"], file_name=file_name, file_url=stored["url"],
        file_type=info["content_type"], file_size=size, original_name=file.filename,
    )
    _record(managed_event_documents, document, stored, cap_query, cap, "document", cap_bytes)
    return {
        "success": True,
        "message": "Document uploaded successfully",
        "document": absolutize(request, serialize(document), "file_url"),
    }


@router.get("/events/{event_id}/uploads/check-name")
def check_upload_names(
    event_id: str,
    file_name: list[str] = Query(default=[]),
    kind: str = Query(default="media", pattern="^(media|documents)$"),
    user: dict = Depends(manager_dep),
):
    """Which of these names the event already has (the "same name?" prompt)."""
    event = _own_event_or_404(event_id, user)
    collection = managed_event_media if kind == "media" else managed_event_documents
    results: dict[str, bool] = {}
    for raw in file_name:
        key = upload_name_key(raw, raw)
        if not key:
            continue
        results[raw] = collection.find_one({
            "event_id": str(event["_id"]),
            "$or": [{"name_key": key}, {"file_name": raw}],
        }) is not None
    return {"success": True, "duplicates": results, "any": any(results.values())}


def _delete_file(collection, record_id: str, event: dict, not_found: str) -> dict:
    """Delete one file. A recorded event keeps its last file of a mandatory
    kind -- the rule that let it be saved -- as a pending teacher event does."""
    record = collection.find_one({"_id": to_object_id(record_id), "event_id": str(event["_id"])})
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=not_found)

    if event.get("status") == RECORDED:
        label = "document" if collection is managed_event_documents else (
            "photo" if record.get("media_type") == "image" else "video"
        )
        if get_upload_limits().get(REQUIREMENT_FIELDS[label]):
            _, query = _evidence(label)
            if collection.count_documents({"event_id": str(event["_id"]), **query}) <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"A saved event must keep at least one {label}. Upload another first.",
                )

    collection.delete_one({"_id": record["_id"]})
    delete_stored(record)
    return record


@router.delete("/events/{event_id}/media/{media_id}")
def delete_media(event_id: str, media_id: str, user: dict = Depends(manager_dep)):
    event = _own_event_or_404(event_id, user)
    record = _delete_file(managed_event_media, media_id, event, "Media not found")
    if event.get("report_photo_ids"):
        managed_events.update_one(
            {"_id": event["_id"]}, {"$pull": {"report_photo_ids": str(record["_id"])}}
        )
    return {"success": True, "message": "Media deleted successfully"}


@router.delete("/events/{event_id}/documents/{document_id}")
def delete_document(event_id: str, document_id: str, user: dict = Depends(manager_dep)):
    event = _own_event_or_404(event_id, user)
    _delete_file(managed_event_documents, document_id, event, "Document not found")
    return {"success": True, "message": "Document deleted successfully"}


# ============================================================
# REPORT PHOTOS AND REPORTS
# ============================================================

@router.put("/events/{event_id}/report-photos")
def set_report_photos(event_id: str, payload: ReportPhotosRequest, user: dict = Depends(manager_dep)):
    event = _own_event_or_404(event_id, user)
    chosen = report_files.clean_report_choice(payload.photo_ids, str(event["_id"]), managed_event_media)
    managed_events.update_one(
        {"_id": event["_id"]}, {"$set": {"report_photo_ids": chosen, "updated_at": utc_now()}}
    )
    return {"success": True, "message": "Report photos saved.", "report_photo_ids": chosen}


# Signed with this scope so a link from an Event Manager report opens only
# files from the Event Manager's collections.
LINK_SCOPE = "managed"


def _download_link(request: Request, kind: str, file_id: str, exp: int) -> str:
    sig = report_files.link_signature(LINK_SCOPE, kind, file_id, exp)
    return absolute_url(request, f"/event-manager/files/{kind}/{file_id}?exp={exp}&sig={sig}")


def _report_entry(request: Request, event: dict, exp: int) -> ReportEntry:
    key = str(event["_id"])
    media = list(managed_event_media.find({"event_id": key}).sort("_id", ASCENDING))
    documents = list(managed_event_documents.find({"event_id": key}).sort("_id", ASCENDING))
    by_id = {str(row["_id"]): row for row in media}

    photos, failures = [], 0
    for pid in _report_photo_ids(event):
        data = report_files.read_file_bytes(by_id[pid], fs)
        prepared = prepare_photo(data) if data else None
        del data
        if prepared:
            photos.append(prepared)
        else:
            failures += 1

    attachments = [
        Attachment(
            name=row.get("original_name") or row.get("file_name") or "file",
            kind="photo" if row.get("media_type") == "image" else "video",
            size=row.get("file_size"),
            url=_download_link(request, "media", str(row["_id"]), exp),
        )
        for row in media
    ] + [
        Attachment(
            name=row.get("original_name") or row.get("file_name") or "file",
            kind="document",
            size=row.get("file_size"),
            url=_download_link(request, "documents", str(row["_id"]), exp),
        )
        for row in documents
    ]

    # The form keeps department and expected participants in the description's
    # metadata blob, exactly as the teacher form does.
    item = with_legacy_metadata(serialize(dict(event)))
    description, meta = split_description(item.get("description"))
    item["description"] = description
    item["expected_participants"] = meta.get("expectedParticipants")
    item["department"] = meta.get("department") or settings.default_host_department
    return ReportEntry(
        event=item,
        photos=photos,
        photo_failures=failures,
        attachments=attachments,
        recorded_by={"name": event.get("owner_name"), "email": event.get("owner_email")},
    )


def _pdf_response(buffer, file_name: str) -> StreamingResponse:
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": content_disposition("attachment", file_name, "Event_Report.pdf"),
            "Cache-Control": "private, no-store",
        },
    )


def _report_file_name(name: str | None) -> str:
    """The event's title as the file name: "IEEE Conference.pdf"."""
    return report_file_name(name)


@router.get("/events/{event_id}/report")
def event_report(event_id: str, request: Request, user: dict = Depends(manager_dep)):
    """The report for one event -- generated directly, no approval involved."""
    event = _own_event_or_404(event_id, user)
    exp = report_files.links_expiry()
    pdf = build_managed_report_pdf(
        [_report_entry(request, event, exp)],
        links_valid_until=datetime.fromtimestamp(exp, tz=timezone.utc),
    )
    logger.info("managed_report_generated events=1 owner=%s", user["id"])
    return _pdf_response(pdf, _report_file_name(event.get("event_name")))


@router.post("/reports")
def multi_event_report(payload: ManagedReportRequest, request: Request, user: dict = Depends(manager_dep)):
    """One consolidated report for several events, in the order given."""
    wanted: list[ObjectId] = []
    for value in payload.event_ids:
        object_id = to_object_id(value)
        if object_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid event id.")
        if object_id not in wanted:
            wanted.append(object_id)
    found = {row["_id"]: row for row in managed_events.find({"_id": {"$in": wanted}, "owner_id": user["id"]})}
    missing = len(wanted) - len(found)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{missing} of the selected events could not be found.",
        )

    exp = report_files.links_expiry()
    entries = [_report_entry(request, found[oid], exp) for oid in wanted]
    pdf = build_managed_report_pdf(
        entries,
        links_valid_until=datetime.fromtimestamp(exp, tz=timezone.utc),
        prepared_by={"name": user.get("name"), "email": user.get("email")},
    )
    logger.info("managed_report_generated events=%d owner=%s", len(entries), user["id"])
    name = (
        _report_file_name(entries[0].event.get("event_name"))
        if len(entries) == 1
        else report_file_name(f"Consolidated_Event_Report_{utc_now():%Y-%m-%d}")
    )
    return _pdf_response(pdf, name)


# ============================================================
# DOWNLOAD LINKS (printed in reports)
# ============================================================

@router.get("/files/{kind}/{file_id}")
def download_file(
    kind: str,
    file_id: str,
    exp: int = Query(...),
    sig: str = Query(..., max_length=128),
):
    """A file from an Event Manager report. The signature is the credential:
    the link is opened from a PDF, without the app's login token."""
    object_id = to_object_id(file_id)
    if not report_files.valid_link(LINK_SCOPE, kind, object_id, exp, sig):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This download link has expired or is invalid.")

    collection = managed_event_media if kind == "media" else managed_event_documents
    return report_files.download_response(collection.find_one({"_id": object_id}), fs)
