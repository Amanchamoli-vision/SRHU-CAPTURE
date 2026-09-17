-- ==============================================================================
-- Migration: 002_event_lifecycle_and_drafts.sql
-- Description: Expand status check constraint to support full event lifecycle and drafts
-- Target Platform: Supabase / PostgreSQL
-- ==============================================================================

-- 1. Update status check constraint to allow full event lifecycle
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_status_check;

ALTER TABLE public.events ADD CONSTRAINT events_status_check 
    CHECK (status IN (
        'draft',
        'submitted',
        'pending',
        'under_review',
        'approved',
        'rejected',
        'published'
    ));

-- 2. Optional lifecycle and event metadata columns (if not already present)
ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS start_time TEXT,
    ADD COLUMN IF NOT EXISTS end_time TEXT,
    ADD COLUMN IF NOT EXISTS department TEXT,
    ADD COLUMN IF NOT EXISTS organizer TEXT,
    ADD COLUMN IF NOT EXISTS expected_participants INTEGER,
    ADD COLUMN IF NOT EXISTS contact_info TEXT,
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- 3. Update RLS policies to allow teachers to update their own editable events
DROP POLICY IF EXISTS "Teachers can update pending events" ON public.events;

CREATE POLICY "Teachers can update own editable events"
    ON public.events
    FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = teacher_id 
        AND status IN ('draft', 'pending', 'submitted', 'rejected')
    )
    WITH CHECK (auth.uid() = teacher_id);

-- 4. Allow teachers to delete their own drafts
CREATE POLICY IF NOT EXISTS "Teachers can delete own drafts"
    ON public.events
    FOR DELETE
    TO authenticated
    USING (
        auth.uid() = teacher_id 
        AND status = 'draft'
    );
