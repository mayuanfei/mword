CREATE TABLE mw_user (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(16) NOT NULL,
  profile_json TEXT NOT NULL,
  quota_available BIGINT NOT NULL DEFAULT 0,
  quota_reserved BIGINT NOT NULL DEFAULT 0,
  sync_cursor BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  CONSTRAINT chk_available CHECK (quota_available >= 0),
  CONSTRAINT chk_reserved CHECK (quota_reserved >= 0)
);
CREATE TABLE mw_session (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES mw_user(id)
);
CREATE INDEX idx_session_user ON mw_session(user_id);
CREATE TABLE mw_review_event (
  user_id VARCHAR(36) NOT NULL,
  event_id VARCHAR(100) NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  word_id VARCHAR(100) NOT NULL,
  sense_id VARCHAR(150) NOT NULL,
  occurred_at BIGINT NOT NULL,
  kind VARCHAR(16) NOT NULL,
  rating INT NOT NULL,
  used_hint BOOLEAN NOT NULL,
  revision BIGINT NOT NULL,
  PRIMARY KEY (user_id, event_id),
  FOREIGN KEY (user_id) REFERENCES mw_user(id)
);
CREATE INDEX idx_review_order ON mw_review_event(user_id, occurred_at, event_id);
CREATE TABLE mw_reading_event (
  user_id VARCHAR(36) NOT NULL,
  event_id VARCHAR(100) NOT NULL,
  article_id VARCHAR(100) NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  position DOUBLE NOT NULL,
  completed BOOLEAN NOT NULL,
  occurred_at BIGINT NOT NULL,
  revision BIGINT NOT NULL,
  PRIMARY KEY (user_id, event_id),
  FOREIGN KEY (user_id) REFERENCES mw_user(id)
);
CREATE TABLE mw_article (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body LONGTEXT NOT NULL,
  source VARCHAR(16) NOT NULL,
  target_word_ids TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  revision BIGINT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES mw_user(id)
);
CREATE TABLE mw_ai_provider (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  base_url VARCHAR(500) NOT NULL,
  model VARCHAR(100) NOT NULL,
  encrypted_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  scenes_json TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL
);
CREATE TABLE mw_ai_task (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  request_id VARCHAR(100) NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  scene VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL,
  cost BIGINT NOT NULL,
  request_json LONGTEXT NOT NULL,
  profile_json TEXT NOT NULL,
  provider_id VARCHAR(36) NOT NULL,
  provider_name VARCHAR(100) NOT NULL,
  provider_model VARCHAR(100) NOT NULL,
  result_text LONGTEXT,
  error_message VARCHAR(500),
  article_id VARCHAR(36),
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  duration_ms BIGINT NOT NULL DEFAULT 0,
  attempts INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE (user_id, request_id),
  FOREIGN KEY (user_id) REFERENCES mw_user(id)
);
CREATE INDEX idx_ai_task_queue ON mw_ai_task(status, created_at);
CREATE INDEX idx_ai_task_cache ON mw_ai_task(user_id, content_hash, status);
CREATE TABLE mw_ai_request (
  user_id VARCHAR(36) NOT NULL,
  request_id VARCHAR(100) NOT NULL,
  task_id VARCHAR(36) NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  PRIMARY KEY(user_id,request_id),
  FOREIGN KEY(task_id) REFERENCES mw_ai_task(id)
);
CREATE TABLE mw_quota_ledger (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  reference_id VARCHAR(100) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  amount BIGINT NOT NULL,
  reason VARCHAR(255) NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (user_id, reference_id, kind),
  FOREIGN KEY (user_id) REFERENCES mw_user(id)
);
