-- BuzzNexus Migration v7: Direct PDF Projector Mode
-- Run in Supabase SQL Editor

-- Add PDF presentation columns to rooms table
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS pdf_mode_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pdf_presentation_url text,
  ADD COLUMN IF NOT EXISTS pdf_pages jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pdf_current_page integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pdf_total_pages integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pdf_title text;

-- Ensure realtime publication includes rooms
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
  END IF;
END$$;

-- Create presentations storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'presentations',
  'presentations',
  true,
  52428800,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authenticated users can upload presentations'
  ) THEN
    CREATE POLICY "Authenticated users can upload presentations"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'presentations');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public read of presentations'
  ) THEN
    CREATE POLICY "Public read of presentations"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'presentations');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Owners can delete presentations'
  ) THEN
    CREATE POLICY "Owners can delete presentations"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'presentations' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END$$;
