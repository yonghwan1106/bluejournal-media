#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# ⚠️ DEPRECATED (2026-06): 사용하지 마세요.
#   DB 경로를 Vultr VPS + MySQL → Neon(서버리스 Postgres) 로 교체했습니다.
#   Neon 절차는 infra/RUNBOOK.md 4~6단계 참고. 이 스크립트는 기록용으로만 남겨둠.
# ──────────────────────────────────────────────────────────────────────────
# (구) 경인블루저널 Vultr VPS DB 셋업 (Ubuntu 24.04)
# MySQL 8 + ProxySQL(커넥션 풀) + UFW + 일일백업(→R2)
echo "DEPRECATED: Neon 으로 전환됨. infra/RUNBOOK.md 4~6단계를 사용하세요." >&2
exit 1
set -euo pipefail

# ───── 설정값 (필요시 수정) ─────
DB_NAME="bluejournal"
DB_USER="bluejournal"
DB_PASS="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"   # 자동 생성
PROXYSQL_PORT=6033

echo "==> 패키지 업데이트"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y && apt-get upgrade -y

echo "==> MySQL 8 설치"
apt-get install -y mysql-server openssl curl gnupg lsb-release ufw

systemctl enable --now mysql

echo "==> DB/계정 생성"
mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'%';
-- ProxySQL 모니터 계정
CREATE USER IF NOT EXISTS 'monitor'@'%' IDENTIFIED BY '${DB_PASS}';
GRANT USAGE, REPLICATION CLIENT ON *.* TO 'monitor'@'%';
FLUSH PRIVILEGES;
SQL

echo "==> MySQL 외부 접속 허용 + TLS 강제(자체서명)"
sed -i 's/^bind-address.*/bind-address = 0.0.0.0/' /etc/mysql/mysql.conf.d/mysqld.cnf
cat >>/etc/mysql/mysql.conf.d/mysqld.cnf <<'CNF'
require_secure_transport = ON
max_connections = 200
CNF
systemctl restart mysql

echo "==> ProxySQL 설치"
curl -fsSL https://repo.proxysql.com/ProxySQL/proxysql-2.x/repo_pub_key | gpg --dearmor -o /usr/share/keyrings/proxysql.gpg
echo "deb [signed-by=/usr/share/keyrings/proxysql.gpg] https://repo.proxysql.com/ProxySQL/proxysql-2.x/$(lsb_release -cs)/ ./" >/etc/apt/sources.list.d/proxysql.list
apt-get update -y && apt-get install -y proxysql
systemctl enable --now proxysql

echo "==> ProxySQL 구성 (admin 6032, 트래픽 ${PROXYSQL_PORT})"
mysql -u admin -padmin -h 127.0.0.1 -P6032 --prompt='' <<PSQL
UPDATE global_variables SET variable_value='${PROXYSQL_PORT}' WHERE variable_name='mysql-interfaces' OR variable_name LIKE 'mysql-interfaces%';
SET mysql-interfaces='0.0.0.0:${PROXYSQL_PORT}';
INSERT INTO mysql_servers(hostgroup_id,hostname,port) VALUES (0,'127.0.0.1',3306);
INSERT INTO mysql_users(username,password,default_hostgroup) VALUES ('${DB_USER}','${DB_PASS}',0);
UPDATE global_variables SET variable_value='monitor' WHERE variable_name='mysql-monitor_username';
UPDATE global_variables SET variable_value='${DB_PASS}' WHERE variable_name='mysql-monitor_password';
UPDATE global_variables SET variable_value=1000 WHERE variable_name='mysql-max_connections';
LOAD MYSQL SERVERS TO RUNTIME; SAVE MYSQL SERVERS TO DISK;
LOAD MYSQL USERS TO RUNTIME;   SAVE MYSQL USERS TO DISK;
LOAD MYSQL VARIABLES TO RUNTIME; SAVE MYSQL VARIABLES TO DISK;
PSQL
systemctl restart proxysql

echo "==> 방화벽(UFW)"
ufw allow OpenSSH
ufw allow ${PROXYSQL_PORT}/tcp comment 'ProxySQL (TLS)'
ufw --force enable

echo "==> 일일 백업 크론 설치"
install -m 700 /root/backup-to-r2.sh /usr/local/bin/bluejournal-backup.sh 2>/dev/null || true
( crontab -l 2>/dev/null; echo "0 4 * * * /usr/local/bin/bluejournal-backup.sh >> /var/log/bj-backup.log 2>&1" ) | crontab -

echo ""
echo "================ 완료 ================"
echo "DB_NAME : ${DB_NAME}"
echo "DB_USER : ${DB_USER}"
echo "DB_PASS : ${DB_PASS}    ← 반드시 안전히 보관!"
echo "연결 URL: mysql://${DB_USER}:${DB_PASS}@<VPS_IP>:${PROXYSQL_PORT}/${DB_NAME}"
echo "Vercel DATABASE_URL 에 위 값을 ssl 옵션과 함께 설정하세요."
echo "====================================="
