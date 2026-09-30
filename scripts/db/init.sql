-- EduBot local development databases.
-- Service-owned databases: no service may connect to another service's database.
-- Test databases are parallel clones used by the pytest suites.
CREATE DATABASE identity_db;
CREATE DATABASE tenancy_db;
CREATE DATABASE users_db;
CREATE DATABASE rbac_db;
CREATE DATABASE audit_db;

CREATE DATABASE identity_test;
CREATE DATABASE tenancy_test;
CREATE DATABASE users_test;
CREATE DATABASE rbac_test;
CREATE DATABASE audit_test;
