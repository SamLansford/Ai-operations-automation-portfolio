CREATE DATABASE ai_support_portfolio_test_results CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE TABLE ai_support_portfolio_test_results.test_runs (
 run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 suite VARCHAR(160) NOT NULL,
 environment ENUM('LOCAL','CI') NOT NULL,
 dependency_mode ENUM('ISOLATED','MOCKED','REAL_INTEGRATION','CONTROLLED_FAULT') NOT NULL,
 provenance ENUM('CAPTURED','HISTORICAL_IMPORT') NOT NULL,
 started_at DATETIME(3) NULL, completed_at DATETIME(3) NULL, observed_at DATETIME(3) NULL,
 duration_ms DOUBLE NULL,
 revision VARCHAR(64) NULL, dirty BOOLEAN NULL,
 fingerprint CHAR(64) NULL, artifact_digest CHAR(64) NOT NULL,
 payload_digest CHAR(64) NOT NULL,
 limitations JSON NOT NULL,
 outcome ENUM('PASS','FAIL','SKIP','ERROR') NOT NULL,
 collector_version VARCHAR(24) NOT NULL,
 ingested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX run_history (observed_at,run_id)
) ENGINE=InnoDB;
CREATE TABLE ai_support_portfolio_test_results.test_results (
 run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 case_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 name VARCHAR(240) NOT NULL,
 outcome ENUM('PASS','FAIL','SKIP','ERROR') NOT NULL,
 categories JSON NOT NULL,
 duration_ms DOUBLE NULL,
 error_code VARCHAR(48) NULL,
 evidence JSON NOT NULL,
 PRIMARY KEY(run_id,case_key),
 FOREIGN KEY(run_id) REFERENCES ai_support_portfolio_test_results.test_runs(run_id)
) ENGINE=InnoDB;
