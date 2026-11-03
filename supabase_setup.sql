-- ==============================================================================
-- CodeLife Supabase Database Setup & Schema
-- Run this in your Supabase Project Dashboard -> SQL Editor -> New Query
-- ==============================================================================

-- 1. Profiles Table (Linked to Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  name TEXT,
  institution TEXT,
  trusted_devices TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable Row Level Security (RLS) on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles RLS Policies
CREATE POLICY "Public profiles can be viewed by anyone"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- 2. User Streaks Table
CREATE TABLE IF NOT EXISTS public.user_streaks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  username TEXT NOT NULL,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_active_date DATE,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own streak"
  ON public.user_streaks FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update own streak"
  ON public.user_streaks FOR ALL
  USING (auth.uid() = user_id OR user_id IS NULL);

-- 3. Code Store Table (Personal Saved Problems & Snippets)
CREATE TABLE IF NOT EXISTS public.code_store (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  username TEXT NOT NULL,
  title TEXT NOT NULL,
  difficulty TEXT DEFAULT 'Easy',
  language TEXT NOT NULL,
  code TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.code_store ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own code store"
  ON public.code_store FOR ALL
  USING (auth.uid() = user_id OR user_id IS NULL);

-- 4. Automatic Profile Creation Trigger on Supabase Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, name, institution, trusted_devices)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'institution', ''),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'trustedDevices')), '{}'::text[])
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    username = COALESCE(EXCLUDED.username, public.profiles.username),
    name = COALESCE(EXCLUDED.name, public.profiles.name),
    institution = COALESCE(EXCLUDED.institution, public.profiles.institution),
    trusted_devices = COALESCE(EXCLUDED.trusted_devices, public.profiles.trusted_devices),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
