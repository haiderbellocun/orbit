CREATE TABLE coordinators (
  id SERIAL PRIMARY KEY,
  document VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(100),
  campus VARCHAR(100),
  school VARCHAR(150),
  cv_link VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE teachers (
  id SERIAL PRIMARY KEY,
  document VARCHAR(20) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(100),
  contract_type VARCHAR(5),
  start_date DATE,
  end_date DATE,
  program VARCHAR(150),
  school VARCHAR(150),
  campus VARCHAR(100),
  area VARCHAR(100),
  modality VARCHAR(50),
  position VARCHAR(150),
  payroll_class VARCHAR(100),
  coordinator_id INTEGER REFERENCES coordinators (id),
  cv_link VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE vacancies (
  id SERIAL PRIMARY KEY,
  origin VARCHAR(50),
  program VARCHAR(150),
  school VARCHAR(150),
  period VARCHAR(20),
  start_date DATE,
  end_date DATE,
  academic_line VARCHAR(150),
  training TEXT,
  experience TEXT,
  dedication VARCHAR(50),
  schedule VARCHAR(100),
  campus VARCHAR(100),
  modality VARCHAR(50),
  subjects TEXT,
  quantity INTEGER DEFAULT 1,
  selected_count INTEGER DEFAULT 0,
  hired_count INTEGER DEFAULT 0,
  status VARCHAR(30) DEFAULT 'open',
  coordinator_id INTEGER REFERENCES coordinators (id),
  observations TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE reinstatements (
  id SERIAL PRIMARY KEY,
  teacher_document VARCHAR(20),
  teacher_name VARCHAR(200),
  contract_type VARCHAR(5),
  start_date DATE,
  end_date DATE,
  position VARCHAR(150),
  program VARCHAR(150),
  school VARCHAR(150),
  campus VARCHAR(100),
  modality VARCHAR(50),
  dedication VARCHAR(50),
  decision VARCHAR(50),
  final_decision VARCHAR(50),
  period VARCHAR(20),
  observations TEXT,
  status VARCHAR(30) DEFAULT 'pending',
  coordinator_id INTEGER REFERENCES coordinators (id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE news (
  id SERIAL PRIMARY KEY,
  teacher_document VARCHAR(20),
  teacher_name VARCHAR(200),
  type VARCHAR(50),
  severity VARCHAR(20) DEFAULT 'medium',
  description TEXT,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW()
);
