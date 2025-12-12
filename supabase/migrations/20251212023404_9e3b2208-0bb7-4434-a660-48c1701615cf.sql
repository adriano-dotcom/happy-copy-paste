-- Create dedicated extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;

-- Grant usage to necessary roles
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Move uuid-ossp extension to extensions schema
DROP EXTENSION IF EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Move pg_net extension to extensions schema (if exists)
DROP EXTENSION IF EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA extensions;

-- Update search_path to include extensions schema for all roles
ALTER DATABASE postgres SET search_path TO public, extensions;