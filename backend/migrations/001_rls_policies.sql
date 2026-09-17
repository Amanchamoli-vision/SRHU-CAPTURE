-- ==============================================================================
-- Migration: 001_rls_policies.sql
-- Description: Baseline Row-Level Security (RLS) policies for campus-capture-srhu
-- Target Platform: Supabase / PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. USERS TABLE
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own profile row
CREATE POLICY IF NOT EXISTS "Users can view their own profile"
    ON public.users
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Allow admins full read access to user directory
CREATE POLICY IF NOT EXISTS "Admins can view all profiles"
    ON public.users
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Allow user creation during signup trigger or admin management
CREATE POLICY IF NOT EXISTS "Admins can manage users"
    ON public.users
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ------------------------------------------------------------------------------
-- 2. EVENTS TABLE
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.events ENABLE ROW LEVEL SECURITY;

-- Prevent anonymous writes completely
-- Allow teachers to create events (must match authenticated uid and teacher role)
CREATE POLICY IF NOT EXISTS "Teachers can insert their own events"
    ON public.events
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = teacher_id
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role = 'teacher'
        )
    );

-- Teachers can view their own events
CREATE POLICY IF NOT EXISTS "Teachers can view own events"
    ON public.events
    FOR SELECT
    TO authenticated
    USING (auth.uid() = teacher_id);

-- Deans and Admins can view all events
CREATE POLICY IF NOT EXISTS "Deans and Admins can view all events"
    ON public.events
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role IN ('dean', 'admin')
        )
    );

-- Approved events are publicly visible
CREATE POLICY IF NOT EXISTS "Anyone can view approved events"
    ON public.events
    FOR SELECT
    TO anon, authenticated
    USING (status = 'approved');

-- Teachers can delete or update their own events before approval
CREATE POLICY IF NOT EXISTS "Teachers can update pending events"
    ON public.events
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = teacher_id AND status = 'pending')
    WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY IF NOT EXISTS "Teachers can delete pending events during rollback"
    ON public.events
    FOR DELETE
    TO authenticated
    USING (auth.uid() = teacher_id);

-- Deans can update event status (approve / reject)
CREATE POLICY IF NOT EXISTS "Deans can update event status"
    ON public.events
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role IN ('dean', 'admin')
        )
    );

-- ------------------------------------------------------------------------------
-- 3. EVENT_MEDIA TABLE
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.event_media ENABLE ROW LEVEL SECURITY;

-- Insert media only for events owned by the authenticated teacher
CREATE POLICY IF NOT EXISTS "Event owner can insert media"
    ON public.event_media
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.events
            WHERE id = event_id AND teacher_id = auth.uid()
        )
    );

-- View media if parent event is viewable
CREATE POLICY IF NOT EXISTS "View media for viewable events"
    ON public.event_media
    FOR SELECT
    TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.events
            WHERE id = event_id AND (
                status = 'approved'
                OR teacher_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.users
                    WHERE id = auth.uid() AND role IN ('dean', 'admin')
                )
            )
        )
    );

-- Delete media during rollback or edit
CREATE POLICY IF NOT EXISTS "Event owner can delete media"
    ON public.event_media
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.events
            WHERE id = event_id AND teacher_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- 4. EVENT_DOCUMENTS TABLE
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.event_documents ENABLE ROW LEVEL SECURITY;

-- Insert documents only for events owned by the authenticated teacher
CREATE POLICY IF NOT EXISTS "Event owner can insert documents"
    ON public.event_documents
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.events
            WHERE id = event_id AND teacher_id = auth.uid()
        )
    );

-- View documents for viewable events
CREATE POLICY IF NOT EXISTS "View documents for viewable events"
    ON public.event_documents
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.events
            WHERE id = event_id AND (
                teacher_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.users
                    WHERE id = auth.uid() AND role IN ('dean', 'admin')
                )
            )
        )
    );

-- Delete documents during rollback or edit
CREATE POLICY IF NOT EXISTS "Event owner can delete documents"
    ON public.event_documents
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.events
            WHERE id = event_id AND teacher_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- 5. STORAGE BUCKET POLICIES (event-media & event-documents)
-- ------------------------------------------------------------------------------
-- Allow authenticated teachers to upload files into their user folder
CREATE POLICY IF NOT EXISTS "Authenticated users can upload event media"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'event-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY IF NOT EXISTS "Authenticated users can upload event documents"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'event-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow public / authenticated reads for media and documents
CREATE POLICY IF NOT EXISTS "Allow reading event media"
    ON storage.objects FOR SELECT TO anon, authenticated
    USING (bucket_id = 'event-media');

CREATE POLICY IF NOT EXISTS "Allow reading event documents"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'event-documents');

-- Allow owners to delete storage objects during rollback
CREATE POLICY IF NOT EXISTS "Allow owners to delete event media"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'event-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY IF NOT EXISTS "Allow owners to delete event documents"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'event-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
