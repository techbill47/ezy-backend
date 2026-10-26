CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matricule TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'coordinator')),
  department_id INTEGER NOT NULL REFERENCES departments(id),
  year INTEGER NOT NULL CHECK (year BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  year INTEGER NOT NULL CHECK (year BETWEEN 1 AND 5),
  created_by UUID NOT NULL REFERENCES users(id),
  UNIQUE (code, department_id, year)
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id),
  started_by UUID NOT NULL REFERENCES users(id),
  code TEXT NOT NULL CHECK (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'ended'))
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_active_code_unique
  ON sessions (code) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id),
  student_id UUID NOT NULL REFERENCES users(id),
  detected_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);
