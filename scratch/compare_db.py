import re
import sys
import mariadb

sys.stdout.reconfigure(encoding='utf-8')

with open('Database.sql', 'r', encoding='utf-8', errors='ignore') as f:
    sql = f.read()

# Find tables in Database.sql
tbl_pattern = re.compile(r"CREATE TABLE IF NOT EXISTS [`'\"]?(\w+)[`'\"]?", re.IGNORECASE)
tables_in_file = tbl_pattern.findall(sql)
print("Tables in Database.sql:", tables_in_file)

# Check sensors data in Database.sql
print("\n--- Sensors in Database.sql ---")
sensor_matches = re.findall(r"INSERT INTO `sensors`.*?VALUES\s*(.*?);", sql, re.DOTALL)
if sensor_matches:
    print(sensor_matches[0].strip())

# Check live DB
print("\n--- Live MariaDB on 10.123.122.225 ---")
conn = mariadb.connect(host='10.123.122.225', port=3306, user='root', password='1234', database='smartclassroom')
cur = conn.cursor()
cur.execute("SHOW TABLES")
live_tables = [r[0] for r in cur.fetchall()]
print("Live tables:", live_tables)

print("\n--- Live sensors table ---")
cur.execute("SELECT id, room_id, sensor_name, sensor_type, unit FROM sensors ORDER BY id")
for r in cur.fetchall():
    print(r)

print("\n--- Live rooms table ---")
cur.execute("SELECT id, room_id, name, control_mode, class_id FROM rooms ORDER BY id")
for r in cur.fetchall():
    print(r)

print("\n--- Live students table ---")
cur.execute("SELECT id, student_code, full_name, card_uid, room_id, class_id FROM students ORDER BY id")
for r in cur.fetchall():
    print(r)

print("\n--- Live classes table ---")
cur.execute("SELECT id, class_code, class_name FROM classes ORDER BY id")
for r in cur.fetchall():
    print(r)

conn.close()
