# Database Schema

*Note: Relational structure tailored for PostgreSQL (Supabase).*

## `users`
- `id` (UUID, Primary Key)
- `email` (String, Unique)
- `created_at` (Timestamp)
- `current_streak` (Integer, default 0)
- `last_active_date` (Date)

## `tracks` (Subjects)
- `id` (UUID, Primary Key)
- `name` (String) - e.g., "C Programming", "Machine Learning"
- `is_active` (Boolean)

## `challenges`
- `id` (UUID, Primary Key)
- `track_id` (UUID, Foreign Key -> tracks.id)
- `publish_date` (Date) - The day this challenge becomes available.
- `title` (String)
- `content` (Text/Markdown) - The problem statement.
- `solution` (Text/Markdown) - The explanation/code to reveal after submission.

## `submissions`
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key -> users.id)
- `challenge_id` (UUID, Foreign Key -> challenges.id)
- `user_code` (Text)
- `completed_at` (Timestamp)