-- Migration: Add firstName and lastName fields to users table
-- This replaces the displayName field with structured name fields

-- Add new columns
ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;

-- Migrate existing displayName data to firstName (best effort)
-- Split displayName on first space: first word -> firstName, rest -> lastName
UPDATE users
SET
  first_name = CASE
    WHEN display_name LIKE '% %' THEN SPLIT_PART(display_name, ' ', 1)
    ELSE display_name
  END,
  last_name = CASE
    WHEN display_name LIKE '% %' THEN SUBSTRING(display_name FROM POSITION(' ' IN display_name) + 1)
    ELSE ''
  END;

-- Make firstName required (NOT NULL)
ALTER TABLE users ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE users ALTER COLUMN last_name SET NOT NULL;

-- Keep displayName for backward compatibility during transition
-- Will be removed in a future migration after all code is updated
