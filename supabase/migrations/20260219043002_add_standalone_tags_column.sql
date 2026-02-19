ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS standalone_tags jsonb DEFAULT '[]'::jsonb;
