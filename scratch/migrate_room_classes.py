import mariadb
import sys

def run_migration():
    try:
        conn = mariadb.connect(
            host="10.123.122.225",
            port=3306,
            user="root",
            password="1234",
            database="smartclassroom"
        )
        cur = conn.cursor()
        print("Connected to MariaDB 10.123.122.225")

        # 1. Check if class_id in rooms
        cur.execute("SHOW COLUMNS FROM rooms LIKE 'class_id'")
        col = cur.fetchone()
        if not col:
            print("Adding class_id to rooms table...")
            cur.execute("""
                ALTER TABLE rooms
                ADD COLUMN class_id INT NULL,
                ADD CONSTRAINT fk_rooms_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
            """)
            conn.commit()
            print("Added class_id column to rooms.")
        else:
            print("class_id already exists in rooms.")

        # 2. Ensure classes exist
        cur.execute("SELECT id, class_code, class_name FROM classes WHERE id=1")
        c1 = cur.fetchone()
        if not c1:
            cur.execute("INSERT INTO classes (id, class_code, class_name) VALUES (1, 'CNTT01', 'Công nghệ thông tin 01')")
        else:
            cur.execute("UPDATE classes SET class_code='CNTT01', class_name='Công nghệ thông tin 01' WHERE id=1")

        cur.execute("SELECT id, class_code, class_name FROM classes WHERE id=2")
        c2 = cur.fetchone()
        if not c2:
            cur.execute("INSERT INTO classes (id, class_code, class_name) VALUES (2, 'CNTT02', 'Công nghệ thông tin 02')")
        else:
            cur.execute("UPDATE classes SET class_code='CNTT02', class_name='Công nghệ thông tin 02' WHERE id=2")

        # 3. Update rooms class_id mapping
        cur.execute("UPDATE rooms SET class_id=1 WHERE room_id='room01'")
        cur.execute("UPDATE rooms SET class_id=2 WHERE room_id='room02'")
        conn.commit()
        print("Updated rooms to classes mapping (room01 -> CNTT01, room02 -> CNTT02).")

        # Verify
        cur.execute("""
            SELECT r.id, r.room_id, r.name, r.class_id, c.class_code, c.class_name
            FROM rooms r
            LEFT JOIN classes c ON r.class_id = c.id
        """)
        rows = cur.fetchall()
        for r in rows:
            print(f"Room: id={r[0]}, room_id={r[1]}, name={r[2]}, class_id={r[3]}, class_code={r[4]}, class_name={r[5]}")

        cur.close()
        conn.close()
        print("Migration successful!")
    except Exception as e:
        print(f"Migration error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_migration()
