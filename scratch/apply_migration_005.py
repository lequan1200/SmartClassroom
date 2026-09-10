import sys
import mariadb

sys.stdout.reconfigure(encoding='utf-8')

DB_CONFIG = {
    "host": "10.123.122.225",
    "port": 3306,
    "user": "root",
    "password": "1234",
    "database": "smartclassroom"
}

def migrate():
    print(f"Connecting to MariaDB at {DB_CONFIG['host']}:{DB_CONFIG['port']}...")
    conn = mariadb.connect(**DB_CONFIG)
    cur = conn.cursor()
    print("Connected successfully!\n")

    # 1. Inspect sensors before migration
    print("--- SENSORS BEFORE MIGRATION ---")
    cur.execute("SELECT id, room_id, sensor_name, sensor_type, unit FROM sensors ORDER BY room_id, id")
    rows_before = cur.fetchall()
    for r in rows_before:
        print(f"  ID: {r[0]} | Room ID: {r[1]} | Sensor Name: {r[2]} | Type: {r[3]} | Unit: {r[4]}")

    # 2. Update 'gas' to 'air_quality' (MQ135, raw)
    print("\nExecuting UPDATE sensors SET sensor_name='air_quality', sensor_type='MQ135', unit='raw' WHERE sensor_name='gas'...")
    cur.execute("""
        UPDATE sensors
        SET sensor_name = 'air_quality',
            sensor_type = 'MQ135',
            unit = 'raw'
        WHERE sensor_name = 'gas'
    """)
    updated_count = cur.rowcount
    print(f"Updated {updated_count} sensor row(s).")

    # 3. Ensure rooms 1 and 2 have air_quality sensor if missing
    cur.execute("""
        INSERT INTO sensors (room_id, sensor_name, sensor_type, unit)
        SELECT r.id, 'air_quality', 'MQ135', 'raw'
        FROM rooms r
        WHERE r.room_id IN ('room01', 'room02')
          AND NOT EXISTS (
            SELECT 1 FROM sensors s
            WHERE s.room_id = r.id AND s.sensor_name = 'air_quality'
          )
    """)
    inserted_count = cur.rowcount
    if inserted_count > 0:
        print(f"Inserted {inserted_count} missing air_quality sensor(s).")

    conn.commit()
    print("Committed transaction successfully!\n")

    # 4. Inspect sensors after migration
    print("--- SENSORS AFTER MIGRATION ---")
    cur.execute("SELECT id, room_id, sensor_name, sensor_type, unit FROM sensors ORDER BY room_id, id")
    rows_after = cur.fetchall()
    for r in rows_after:
        print(f"  ID: {r[0]} | Room ID: {r[1]} | Sensor Name: {r[2]} | Type: {r[3]} | Unit: {r[4]}")

    # 5. Verify sensor_current mapping
    print("\n--- SENSOR_CURRENT STATUS ---")
    cur.execute("""
        SELECT sc.sensor_id, s.room_id, r.room_id AS room_code, s.sensor_name, s.unit, sc.value, sc.updated_at
        FROM sensor_current sc
        JOIN sensors s ON sc.sensor_id = s.id
        JOIN rooms r ON s.room_id = r.id
        WHERE s.sensor_name = 'air_quality'
        ORDER BY s.room_id
    """)
    for r in cur.fetchall():
        print(f"  Sensor ID: {r[0]} | Room: {r[2]} (id={r[1]}) | Sensor: {r[3]} ({r[4]}) | Current Value: {r[5]} | Updated: {r[6]}")

    cur.close()
    conn.close()
    print("\nMigration completed successfully!")

if __name__ == "__main__":
    migrate()
