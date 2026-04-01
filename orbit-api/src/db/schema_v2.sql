CREATE TABLE IF NOT EXISTS lites (
  id SERIAL PRIMARY KEY,
  document VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(100),
  program VARCHAR(150),
  school VARCHAR(150),
  academic_line VARCHAR(150),
  cv_link VARCHAR(255),
  coordinator_document VARCHAR(20),
  coordinator_name VARCHAR(150),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic_load (
  id SERIAL PRIMARY KEY,
  teacher_document VARCHAR(20) NOT NULL,
  teacher_name VARCHAR(200),
  email VARCHAR(100),
  modality_code VARCHAR(10),
  modality VARCHAR(10),
  period VARCHAR(20),
  level_num VARCHAR(10),
  unit_code VARCHAR(20),
  unit_name VARCHAR(150),
  pensum_code VARCHAR(20),
  subject_code VARCHAR(20),
  subject_name VARCHAR(200),
  credits NUMERIC(4,1),
  group_id VARCHAR(20),
  type VARCHAR(20) DEFAULT 'current',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academic_load_teacher ON academic_load (teacher_document);
CREATE INDEX IF NOT EXISTS idx_academic_load_period ON academic_load (period);
CREATE INDEX IF NOT EXISTS idx_lites_coordinator ON lites (coordinator_document);
