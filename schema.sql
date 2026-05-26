-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- Create profiles table
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  updated_at timestamp with time zone,
  username text unique,
  full_name text,
  avatar_url text
);

-- Enable RLS on profiles
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone." on public.profiles
  for select using (true);

create policy "Users can update their own profile." on public.profiles
  for update using (auth.uid() = id);

-- Create profiles trigger on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger security setup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Create rooms table
create table public.rooms (
  id uuid default gen_random_uuid() primary key,
  code text not null unique,
  mentor_id uuid references public.profiles(id) on delete cascade not null,
  participant_limit integer default 50 not null,
  status text default 'waiting'::text not null, -- 'waiting', 'active', 'finished'
  created_at timestamp with time zone default now() not null
);

-- Enable RLS on rooms
alter table public.rooms enable row level security;

create policy "Rooms are viewable by everyone" on public.rooms
  for select using (true);

create policy "Mentors can insert rooms" on public.rooms
  for insert with check (auth.uid() = mentor_id);

create policy "Mentors can update rooms" on public.rooms
  for update using (auth.uid() = mentor_id);

create policy "Mentors can delete rooms" on public.rooms
  for delete using (auth.uid() = mentor_id);

-- Create participants table
create table public.participants (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.rooms(id) on delete cascade not null,
  name text not null,
  player_number integer not null,
  session_id text not null, -- student browser identifier
  joined_at timestamp with time zone default now() not null
);

-- Enable RLS on participants
alter table public.participants enable row level security;

create policy "Participants are viewable by everyone" on public.participants
  for select using (true);

create policy "Anyone can join rooms as participant" on public.participants
  for insert with check (true);

create policy "Participants can update their own record" on public.participants
  for update using (true);

create policy "Participants can leave or mentors can kick" on public.participants
  for delete using (true);

-- Enable Realtime for participants table (Supabase publication)
alter publication supabase_realtime add table public.participants;

-- Alter rooms table for game state
alter table public.rooms add column current_quiz_id uuid;
alter table public.rooms add column current_question_id uuid;
alter table public.rooms add column game_state text default 'waiting'; -- 'waiting', 'starting', 'question_active', 'question_results', 'leaderboard', 'finished'
alter table public.rooms add column question_start_time timestamp with time zone;

-- Alter participants table for score tracking
alter table public.participants add column score integer default 0 not null;

-- Create quizzes table
create table public.quizzes (
  id uuid default gen_random_uuid() primary key,
  mentor_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  source_document_url text, -- Supabase storage URL
  created_at timestamp with time zone default now() not null
);

-- Enable RLS on quizzes
alter table public.quizzes enable row level security;
create policy "Mentors can manage their quizzes" on public.quizzes
  for all using (auth.uid() = mentor_id);
create policy "Anyone can view quizzes" on public.quizzes
  for select using (true);

-- Create questions table
create table public.questions (
  id uuid default gen_random_uuid() primary key,
  quiz_id uuid references public.quizzes(id) on delete cascade not null,
  question_text text not null,
  options jsonb not null, -- Array of strings
  correct_answer text not null,
  time_limit integer default 30 not null,
  order_index integer not null
);

-- Enable RLS on questions
alter table public.questions enable row level security;
create policy "Mentors can manage questions of their quizzes" on public.questions
  for all using (
    exists (
      select 1 from public.quizzes where id = quiz_id and mentor_id = auth.uid()
    )
  );
create policy "Anyone can view questions" on public.questions
  for select using (true);

-- Create responses table
create table public.responses (
  id uuid default gen_random_uuid() primary key,
  participant_id uuid references public.participants(id) on delete cascade not null,
  question_id uuid references public.questions(id) on delete cascade not null,
  selected_answer text not null,
  is_correct boolean not null,
  points_awarded integer default 0 not null,
  answered_at timestamp with time zone default now() not null,
  unique (participant_id, question_id)
);

-- Enable RLS on responses
alter table public.responses enable row level security;
create policy "Participants can insert their responses" on public.responses
  for insert with check (true);
create policy "Participants can view responses in their room" on public.responses
  for select using (true);

-- Add realtime support to rooms (if not already added, usually rooms table might need real-time)
alter publication supabase_realtime add table public.rooms;

-- Setup storage for document uploads
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;

create policy "Mentors can upload documents" on storage.objects
  for insert with check ( bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1] );

create policy "Anyone can read documents" on storage.objects
  for select using ( bucket_id = 'documents' );

-- Phase 3: Advanced Mentor Configs and Game State Updates
alter table public.rooms add column marks_per_question integer default 500 not null;
alter table public.rooms add column negative_marking boolean default false not null;
alter table public.rooms add column fastest_bonus boolean default true not null;
alter table public.rooms add column streak_bonus boolean default true not null;
alter table public.rooms add column randomize_questions boolean default false not null;
alter table public.rooms add column randomize_options boolean default false not null;
alter table public.rooms add column timer_override integer; -- null means use question default

-- Note: room game_state gets a new valid text value: 'answer_reveal'

-- Phase 3: Advanced Question Types
alter table public.questions add column question_type text default 'mcq' not null; -- 'mcq', 'fill_blank', 'descriptive'
alter table public.questions add column metadata jsonb default '{}'::jsonb not null;

-- Phase 3: Advanced Participant Tracking
alter table public.participants add column streak_count integer default 0 not null;
alter table public.participants add column accuracy numeric default 0 not null;

-- Phase 3: Precision Analytics for Responses
alter table public.responses add column response_time_ms integer default 0 not null;

-- Phase 3: RPC Functions
create or replace function public.increment_score(p_id uuid, points_to_add integer, new_streak integer)
returns void
language sql
security definer
as $$
  update public.participants
  set score = score + points_to_add,
      streak_count = new_streak
  where id = p_id;
$$;
-- Phase 4: Buzzer Arena Overhaul
alter table public.rooms add column locked_participant_id uuid references public.participants(id) on delete set null;
alter table public.rooms add column current_buzzer_index integer default 0;

create table public.buzzes (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.rooms(id) on delete cascade not null,
  question_id uuid references public.questions(id) on delete cascade not null,
  participant_id uuid references public.participants(id) on delete cascade not null,
  buzz_time timestamp with time zone default now() not null,
  unique (room_id, question_id, participant_id)
);

alter table public.buzzes enable row level security;
create policy "Participants can buzz" on public.buzzes for insert with check (true);
create policy "Anyone can view buzzes" on public.buzzes for select using (true);
alter publication supabase_realtime add table public.buzzes;
