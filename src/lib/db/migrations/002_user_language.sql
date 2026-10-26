-- The language the person reads the app in (2026-10-25 product-owner request): a code from
-- config/languages.json, or null when the account has not chosen one yet.
ALTER TABLE users ADD COLUMN language TEXT;
