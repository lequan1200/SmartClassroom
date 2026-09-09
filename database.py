import mariadb
from datetime import datetime, timedelta, time, date

DB_HOST = "10.123.122.225"
DB_PORT = 3306
DB_USER = "root"
DB_PASSWORD = "1234"
DB_NAME = "smartclassroom"


def ket_noi():
    try:
        return mariadb.connect(
            host=DB_HOST, port=DB_PORT, user=DB_USER,
            password=DB_PASSWORD, database=DB_NAME
        )
    except mariadb.Error as e:
        print(f"DB ERROR: {e}")
        return None


def tim_sensor_id(room_id, sensor_name):
    conn = ket_noi()
    if conn is None:
        return None
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT sensors.id FROM sensors
            JOIN rooms ON sensors.room_id = rooms.id
            WHERE rooms.room_id = ? AND sensors.sensor_name = ?
        """, (room_id, sensor_name))
        result = cursor.fetchone()

        if result is None:
            alias = "RFID" if str(sensor_name).lower() == "door" else ("door" if str(sensor_name).lower() == "rfid" else None)
            if alias:
                cursor.execute("""
                    SELECT sensors.id FROM sensors
                    JOIN rooms ON sensors.room_id = rooms.id
                    WHERE rooms.room_id = ? AND sensors.sensor_name = ?
                """, (room_id, alias))
                result = cursor.fetchone()

        cursor.close()
        conn.close()
        return result[0] if result else None
    except mariadb.Error as e:
        print(f"DB ERROR: {e}")
        if conn:
            conn.close()
        return None


def luu_sensor_data(sensor_id, value):
    conn = ket_noi()
    if conn is None:
        return False
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO sensor_data (sensor_id, value) VALUES (?, ?)", (sensor_id, value))
        conn.commit()
        cursor.close()
        conn.close()
        return True
    except mariadb.Error as e:
        print(f"DB ERROR: {e}")
        conn.rollback()
        conn.close()
        return False


def cap_nhat_sensor_current(sensor_id, value):
    conn = ket_noi()
    if conn is None:
        return False
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO sensor_current (sensor_id, value)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE
                value = VALUES(value),
                updated_at = CURRENT_TIMESTAMP
        """, (sensor_id, value))
        conn.commit()
        cursor.close()
        conn.close()
        return True
    except mariadb.Error as e:
        print(f"DB ERROR: {e}")
        conn.rollback()
        conn.close()
        return False


def tim_device_id(room_id, device_name):
    conn = ket_noi()
    if conn is None:
        return None
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT devices.id FROM devices
            JOIN rooms ON devices.room_id = rooms.id
            WHERE rooms.room_id = ? AND devices.device_name = ?
        """, (room_id, device_name))
        result = cursor.fetchone()
        cursor.close()
        conn.close()
        return result[0] if result else None
    except mariadb.Error as e:
        print(f"DB ERROR: {e}")
        if conn:
            conn.close()
        return None


def cap_nhat_device_current(device_id, state):
    conn = ket_noi()
    if conn is None:
        return False
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO device_current (device_id, state)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE
                state = VALUES(state),
                updated_at = CURRENT_TIMESTAMP
        """, (device_id, state))
        conn.commit()
        cursor.close()
        conn.close()
        return True
    except mariadb.Error as e:
        print(f"DB ERROR: {e}")
        conn.rollback()
        conn.close()
        return False


def luu_device_log(device_id, action):
    conn = ket_noi()
    if conn is None:
        return False
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO device_logs (device_id, action) VALUES (?, ?)", (device_id, action))
        conn.commit()
        cursor.close()
        conn.close()
        return True
    except mariadb.Error as e:
        print(f"DB ERROR: {e}")
        conn.rollback()
        conn.close()
        return False


def lay_sensor_hien_tai(room_id):
    conn = ket_noi()
    if conn is None:
        return None
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT sensors.sensor_name, sensors.unit, sensor_current.value, sensor_current.updated_at
            FROM sensors
            JOIN rooms ON sensors.room_id = rooms.id
            LEFT JOIN sensor_current ON sensors.id = sensor_current.sensor_id
            WHERE rooms.room_id = ?
            ORDER BY sensors.id
        """, (room_id,))
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        return [
            {
                "sensor_name": row[0], "unit": row[1],
                "value": float(row[2]) if row[2] is not None else None,
                "updated_at": row[3].isoformat() if row[3] else None
            }
            for row in rows
        ]
    except mariadb.Error as e:
        print(f"DB ERROR: {e}")
        if conn:
            conn.close()
        return None


def lay_device_hien_tai(room_id):
    conn = ket_noi()
    if conn is None:
        return None
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT devices.device_name, devices.device_type, device_current.state, device_current.updated_at
            FROM devices
            JOIN rooms ON devices.room_id = rooms.id
            LEFT JOIN device_current ON devices.id = device_current.device_id
            WHERE rooms.room_id = ?
            ORDER BY devices.id
        """, (room_id,))
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        return [
            {
                "device_name": row[0], "device_type": row[1],
                "state": row[2],
                "updated_at": row[3].isoformat() if row[3] else None
            }
            for row in rows
        ]
    except mariadb.Error as e:
        print(f"DB ERROR: {e}")
        if conn:
            conn.close()
        return None


def lay_danh_sach_phong():
    conn = ket_noi()
    if conn is None:
        return None
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, room_id, name, created_at, control_mode FROM rooms ORDER BY id")
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        return [
            {
                "id": row[0], "room_id": row[1], "name": row[2],
                "created_at": row[3].isoformat() if row[3] else None,
                "control_mode": row[4] if len(row) > 4 and row[4] else "MANUAL"
            }
            for row in rows
        ]
    except mariadb.Error as e:
        print(f"DB ERROR: {e}")
        if conn:
            conn.close()
        return None


def lay_phong(room_id):
    conn = ket_noi()
    if conn is None:
        return None
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, room_id, name, created_at, control_mode FROM rooms WHERE room_id = ?", (room_id,))
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        if row is None:
            return None
        return {
            "id": row[0], "room_id": row[1], "name": row[2],
            "created_at": row[3].isoformat() if row[3] else None,
            "control_mode": row[4] if len(row) > 4 and row[4] else "MANUAL"
        }
    except mariadb.Error as e:
        print(f"DB ERROR: {e}")
        if conn:
            conn.close()
        return None


def lay_che_do_phong(room_id):
    conn = ket_noi()
    if conn is None:
        return "MANUAL"
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT control_mode FROM rooms WHERE room_id = ?", (room_id,))
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        if row and row[0]:
            return row[0].upper()
        return "MANUAL"
    except mariadb.Error as e:
        print(f"DB ERROR lay_che_do_phong: {e}")
        if conn:
            conn.close()
        return "MANUAL"


def cap_nhat_che_do_phong(room_id, mode):
    mode = str(mode).upper()
    if mode not in ["MANUAL", "AUTO"]:
        return False
    conn = ket_noi()
    if conn is None:
        return False
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE rooms SET control_mode = ? WHERE room_id = ?", (mode, room_id))
        conn.commit()
        cursor.close()
        conn.close()
        return True
    except mariadb.Error as e:
        print(f"DB ERROR cap_nhat_che_do_phong: {e}")
        if conn:
            conn.rollback()
            conn.close()
        return False


def lay_sensor(room_id, sensor_name):
    conn = ket_noi()
    if conn is None:
        return None
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT sensors.id, sensors.sensor_name, sensors.sensor_type, sensors.unit,
                   sensor_current.value, sensor_current.updated_at
            FROM sensors
            JOIN rooms ON sensors.room_id = rooms.id
            LEFT JOIN sensor_current ON sensors.id = sensor_current.sensor_id
            WHERE rooms.room_id = ? AND sensors.sensor_name = ?
        """, (room_id, sensor_name))
        row = cursor.fetchone()

        if row is None:
            alias = "RFID" if str(sensor_name).lower() == "door" else ("door" if str(sensor_name).lower() == "rfid" else None)
            if alias:
                cursor.execute("""
                    SELECT sensors.id, sensors.sensor_name, sensors.sensor_type, sensors.unit,
                           sensor_current.value, sensor_current.updated_at
                    FROM sensors
                    JOIN rooms ON sensors.room_id = rooms.id
                    LEFT JOIN sensor_current ON sensors.id = sensor_current.sensor_id
                    WHERE rooms.room_id = ? AND sensors.sensor_name = ?
                """, (room_id, alias))
                row = cursor.fetchone()

        cursor.close()
        conn.close()
        if row is None:
            return None
        return {
            "id": row[0], "sensor_name": row[1], "sensor_type": row[2],
            "unit": row[3],
            "value": float(row[4]) if row[4] is not None else None,
            "updated_at": row[5].isoformat() if row[5] else None
        }
    except mariadb.Error as e:
        print(f"DB ERROR: {e}")
        if conn:
            conn.close()
        return None


def lay_sensor_history(room_id, sensor_name, limit=100):
    conn = ket_noi()
    if conn is None:
        return None
    try:
        cursor = conn.cursor()
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            limit = 100
        limit = min(max(1, limit), 1000)

        cursor.execute("""
            SELECT sensor_data.value, sensor_data.recorded_at
            FROM sensor_data
            JOIN sensors ON sensor_data.sensor_id = sensors.id
            JOIN rooms ON sensors.room_id = rooms.id
            WHERE rooms.room_id = ? AND sensors.sensor_name = ?
            ORDER BY sensor_data.recorded_at DESC
            LIMIT ?
        """, (room_id, sensor_name, limit))
        rows = cursor.fetchall()

        if not rows:
            alias = "RFID" if str(sensor_name).lower() == "door" else ("door" if str(sensor_name).lower() == "rfid" else None)
            if alias:
                cursor.execute("""
                    SELECT sensor_data.value, sensor_data.recorded_at
                    FROM sensor_data
                    JOIN sensors ON sensor_data.sensor_id = sensors.id
                    JOIN rooms ON sensors.room_id = rooms.id
                    WHERE rooms.room_id = ? AND sensors.sensor_name = ?
                    ORDER BY sensor_data.recorded_at DESC
                    LIMIT ?
                """, (room_id, alias, limit))
                rows = cursor.fetchall()

        cursor.close()
        conn.close()
        return [
            {"value": float(row[0]), "recorded_at": row[1].isoformat() if row[1] else None}
            for row in rows
        ]
    except mariadb.Error as e:
        print(f"DB ERROR: {e}")
        if conn:
            conn.close()
        return None


def lay_device(room_id, device_name):
    conn = ket_noi()
    if conn is None:
        return None
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT devices.id, devices.device_name, devices.device_type,
                   device_current.state, device_current.updated_at
            FROM devices
            JOIN rooms ON devices.room_id = rooms.id
            LEFT JOIN device_current ON devices.id = device_current.device_id
            WHERE rooms.room_id = ? AND devices.device_name = ?
        """, (room_id, device_name))
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        if row is None:
            return None
        return {
            "id": row[0], "device_name": row[1], "device_type": row[2],
            "state": row[3],
            "updated_at": row[4].isoformat() if row[4] else None
        }
    except mariadb.Error as e:
        print(f"DB ERROR: {e}")
        if conn:
            conn.close()
        return None


def tim_hoc_vien_theo_card(card_uid):
    """Tìm học viên theo mã thẻ RFID (dùng để hiển thị tên trong nhật ký quét thẻ)."""
    if not card_uid:
        return None
    conn = ket_noi()
    if conn is None:
        return None
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT st.id, st.student_code, st.full_name, st.card_uid,
                   st.class_id, c.class_code, c.class_name
            FROM students st
            LEFT JOIN classes c ON c.id = st.class_id
            WHERE UPPER(st.card_uid) = UPPER(?)
        """, (card_uid.strip(),))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return None
        return {
            "id": row[0],
            "student_code": row[1],
            "full_name": row[2],
            "card_uid": row[3],
            "class_id": row[4],
            "class_code": row[5] or "",
            "class_name": row[6] or row[5] or "---"
        }
    except mariadb.Error as e:
        print(f"DB ERROR tim_hoc_vien_theo_card: {e}")
        if conn:
            conn.close()
        return None


def luu_attendance_log(room_id, card_uid, event_type="CHECK_IN", status="DUNG_GIO", recorded_at=None):
    """Lưu nhật ký quét thẻ RFID thô vào attendance_logs."""
    card_uid = card_uid.strip().upper() if card_uid else ""
    if not card_uid:
        return False

    conn = ket_noi()
    if conn is None:
        return False
    try:
        cur = conn.cursor()

        room_db_id = 1
        if isinstance(room_id, int):
            room_db_id = room_id
        else:
            cur.execute("SELECT id FROM rooms WHERE room_id = ?", (str(room_id),))
            r_row = cur.fetchone()
            if r_row:
                room_db_id = r_row[0]

        cur.execute("SELECT id FROM students WHERE UPPER(card_uid) = UPPER(?)", (card_uid,))
        s_row = cur.fetchone()
        student_id = s_row[0] if s_row else None

        if recorded_at:
            cur.execute("""
                INSERT INTO attendance_logs (room_id, student_id, card_uid, event_type, status, recorded_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (room_db_id, student_id, card_uid, event_type, status, recorded_at))
        else:
            cur.execute("""
                INSERT INTO attendance_logs (room_id, student_id, card_uid, event_type, status)
                VALUES (?, ?, ?, ?, ?)
            """, (room_db_id, student_id, card_uid, event_type, status))

        conn.commit()
        log_id = cur.lastrowid
        cur.close()
        conn.close()
        return log_id
    except mariadb.Error as e:
        print(f"DB ERROR luu_attendance_log: {e}")
        conn.rollback()
        conn.close()
        return False


def lay_danh_sach_diem_danh(room_id=None, limit=100, ngay=None):
    """Lấy nhật ký quét thẻ RFID thô từ attendance_logs."""
    conn = ket_noi()
    if conn is None:
        return None
    try:
        cur = conn.cursor()
        query = """
            SELECT att.id, r.room_id, r.name AS room_name, att.card_uid, att.student_id,
                   st.student_code, st.full_name, st.class_name, att.event_type, att.status, att.recorded_at
            FROM attendance_logs att
            JOIN rooms r ON att.room_id = r.id
            LEFT JOIN students st ON att.student_id = st.id
            WHERE 1=1
        """
        params = []
        if room_id:
            query += " AND r.room_id = ?"; params.append(str(room_id))
        if ngay:
            query += " AND DATE(att.recorded_at) = ?"; params.append(str(ngay))
        query += " ORDER BY att.recorded_at DESC LIMIT ?"
        params.append(min(max(1, int(limit or 100)), 500))
        cur.execute(query, tuple(params)); rows = cur.fetchall()
        cur.close(); conn.close()
        return [{"id": r[0], "room_id": r[1], "room_name": r[2], "card_uid": r[3],
                 "student_id": r[4], "student_code": r[5] or "---", "full_name": r[6] or "Thẻ chưa đăng ký",
                 "class_name": r[7] or "---", "event_type": r[8], "status": r[9] or "NORMAL",
                 "recorded_at": r[10].isoformat() if r[10] else None} for r in rows]
    except (mariadb.Error, ValueError) as e:
        print(f"DB ERROR lay_danh_sach_diem_danh: {e}")
        if conn: conn.close()
        return None


# ===== THỜI KHÓA BIỂU VÀ ĐIỂM DANH THEO BUỔI =====

def _rows_as_dicts(rows, columns):
    return [dict(zip(columns, row)) for row in rows]


def lay_danh_sach_lop():
    conn = ket_noi()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute("""SELECT c.id, c.class_code, c.class_name, c.academic_year, c.description,
                       c.is_active, COUNT(st.id) AS student_count
                       FROM classes c
                       LEFT JOIN students st ON st.class_id = c.id
                       GROUP BY c.id ORDER BY c.class_code""")
        rows = _rows_as_dicts(cur.fetchall(), ["id", "class_code", "class_name", "academic_year", "description", "is_active", "student_count"])
        for r in rows:
            r["total_students"] = r["student_count"]
        cur.close(); conn.close()
        return rows
    except mariadb.Error as e:
        print(f"DB ERROR lay_danh_sach_lop: {e}"); conn.close(); return None


def lay_chi_tiet_lop(class_id):
    conn = ket_noi()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute("""SELECT c.id, c.class_code, c.class_name, c.academic_year, c.description,
                       c.is_active, COUNT(st.id) AS student_count
                       FROM classes c
                       LEFT JOIN students st ON st.class_id = c.id
                       WHERE c.id = ?
                       GROUP BY c.id""", (class_id,))
        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            return None
        cols = ["id", "class_code", "class_name", "academic_year", "description", "is_active", "student_count"]
        d = dict(zip(cols, row))
        d["total_students"] = d["student_count"]
        return d
    except mariadb.Error as e:
        print(f"DB ERROR lay_chi_tiet_lop: {e}"); conn.close(); return None


def tao_lop(class_code, class_name, academic_year=None, description=None):
    conn = ket_noi()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute("INSERT INTO classes (class_code, class_name, academic_year, description) VALUES (?, ?, ?, ?)",
                    (class_code.strip(), class_name.strip(), academic_year, description))
        conn.commit(); result = cur.lastrowid
        cur.close(); conn.close()
        return result
    except mariadb.Error as e:
        print(f"DB ERROR tao_lop: {e}"); conn.rollback(); conn.close(); return None


def cap_nhat_lop(class_id, class_code=None, class_name=None, academic_year=None, description=None, is_active=None):
    conn = ket_noi()
    if not conn:
        return False
    try:
        cur = conn.cursor()
        updates = []
        params = []
        if class_code is not None:
            updates.append("class_code = ?")
            params.append(class_code.strip())
        if class_name is not None:
            updates.append("class_name = ?")
            params.append(class_name.strip())
        if academic_year is not None:
            updates.append("academic_year = ?")
            params.append(academic_year)
        if description is not None:
            updates.append("description = ?")
            params.append(description)
        if is_active is not None:
            updates.append("is_active = ?")
            params.append(1 if is_active else 0)
        if not updates:
            cur.close(); conn.close()
            return True
        params.append(class_id)
        cur.execute(f"UPDATE classes SET {', '.join(updates)} WHERE id = ?", tuple(params))
        conn.commit()
        affected = cur.rowcount
        cur.close(); conn.close()
        return affected >= 0
    except mariadb.Error as e:
        print(f"DB ERROR cap_nhat_lop: {e}"); conn.rollback(); conn.close(); return False


def xoa_lop(class_id):
    conn = ket_noi()
    if not conn:
        return False
    try:
        cur = conn.cursor()
        cur.execute("UPDATE students SET class_id = NULL WHERE class_id = ?", (class_id,))
        cur.execute("DELETE FROM classes WHERE id = ?", (class_id,))
        conn.commit()
        affected = cur.rowcount
        cur.close(); conn.close()
        return affected > 0
    except mariadb.Error as e:
        print(f"DB ERROR xoa_lop: {e}"); conn.rollback(); conn.close(); return False


def lay_danh_sach_mon_hoc():
    conn = ket_noi()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, subject_code, subject_name, description, is_active FROM subjects ORDER BY subject_code")
        rows = _rows_as_dicts(cur.fetchall(), ["id", "subject_code", "subject_name", "description", "is_active"])
        cur.close(); conn.close()
        return rows
    except mariadb.Error as e:
        print(f"DB ERROR lay_danh_sach_mon_hoc: {e}"); conn.close(); return None


def tao_mon_hoc(subject_code, subject_name, description=None):
    conn = ket_noi()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute("INSERT INTO subjects (subject_code, subject_name, description) VALUES (?, ?, ?)",
                    (subject_code, subject_name, description))
        conn.commit(); result = cur.lastrowid
        cur.close(); conn.close()
        return result
    except mariadb.Error as e:
        print(f"DB ERROR tao_mon_hoc: {e}"); conn.rollback(); conn.close(); return None


def lay_hoc_vien_theo_lop(class_id, search=None):
    """Lấy danh sách học sinh CHỈ THUỘC LỚP NÀY (tách biệt hoàn toàn)."""
    conn = ket_noi()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        query = """SELECT st.id, st.student_code, st.full_name, st.card_uid,
                          st.class_id, c.class_code, c.class_name,
                          st.email, st.phone, st.created_at
                   FROM students st
                   JOIN classes c ON c.id = st.class_id
                   WHERE st.class_id = ?"""
        params = [class_id]
        if search:
            search_str = f"%{search.strip()}%"
            query += " AND (st.student_code LIKE ? OR st.full_name LIKE ? OR st.card_uid LIKE ?)"
            params.extend([search_str, search_str, search_str])
        query += " ORDER BY st.student_code ASC"
        cur.execute(query, tuple(params))
        columns = ["id", "student_code", "full_name", "card_uid", "class_id", "class_code", "class_name", "email", "phone", "created_at"]
        rows = _rows_as_dicts(cur.fetchall(), columns)
        for r in rows:
            r["rfid_uid"] = r["card_uid"]
            if r["created_at"] and hasattr(r["created_at"], "isoformat"):
                r["created_at"] = r["created_at"].isoformat()
            elif r["created_at"]:
                r["created_at"] = str(r["created_at"])
            r["status"] = "ACTIVE"
        cur.close(); conn.close()
        return rows
    except mariadb.Error as e:
        print(f"DB ERROR lay_hoc_vien_theo_lop: {e}"); conn.close(); return None


def lay_hoc_vien_cua_lop(class_id):
    """Alias tương thích cho lay_hoc_vien_theo_lop."""
    return lay_hoc_vien_theo_lop(class_id)


def lay_chi_tiet_hoc_vien(student_id):
    """Lấy thông tin chi tiết một học sinh theo id."""
    conn = ket_noi()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT st.id, st.student_code, st.full_name, st.card_uid,
                   st.class_id, c.class_code, c.class_name,
                   st.email, st.phone, st.created_at
            FROM students st
            LEFT JOIN classes c ON c.id = st.class_id
            WHERE st.id = ?
        """, (student_id,))
        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            return None
        columns = ["id", "student_code", "full_name", "card_uid", "class_id", "class_code", "class_name", "email", "phone", "created_at"]
        d = dict(zip(columns, row))
        d["rfid_uid"] = d["card_uid"]
        if d["created_at"] and hasattr(d["created_at"], "isoformat"):
            d["created_at"] = d["created_at"].isoformat()
        return d
    except mariadb.Error as e:
        print(f"DB ERROR lay_chi_tiet_hoc_vien: {e}"); conn.close(); return None


def them_hoc_vien_vao_lop(class_id, student_code, full_name, card_uid=None, email=None, phone=None):
    """Thêm học sinh mới trực tiếp vào lớp đã chọn."""
    conn = ket_noi()
    if not conn:
        return {"success": False, "error": "Không thể kết nối MariaDB"}
    try:
        cur = conn.cursor()
        student_code = student_code.strip()
        full_name = full_name.strip()
        card_uid = card_uid.strip().upper() if card_uid and card_uid.strip() else None
        email = email.strip() if email and email.strip() else None
        phone = phone.strip() if phone and phone.strip() else None

        # Kiểm tra lớp tồn tại
        cur.execute("SELECT id, class_code, class_name FROM classes WHERE id = ?", (class_id,))
        cls_row = cur.fetchone()
        if not cls_row:
            cur.close(); conn.close()
            return {"success": False, "error": "Lớp học không tồn tại"}

        # Kiểm tra trùng thẻ RFID
        if card_uid:
            cur.execute("SELECT id, student_code, full_name FROM students WHERE UPPER(card_uid) = ?", (card_uid,))
            dup_card = cur.fetchone()
            if dup_card:
                cur.close(); conn.close()
                return {"success": False, "error": f"Mã thẻ RFID {card_uid} đã được gán cho học sinh {dup_card[2]} ({dup_card[1]})!"}

        # Kiểm tra trùng mã sinh viên
        cur.execute("SELECT id, full_name, class_id FROM students WHERE student_code = ?", (student_code,))
        existing = cur.fetchone()
        if existing:
            # Nếu học sinh đã tồn tại nhưng chưa có lớp, cho phép gán vào lớp
            if existing[2] is None:
                cur.execute("UPDATE students SET class_id = ?, full_name = ?, card_uid = COALESCE(?, card_uid), email = COALESCE(?, email), phone = COALESCE(?, phone) WHERE id = ?",
                            (class_id, full_name, card_uid, email, phone, existing[0]))
                conn.commit()
                cur.close(); conn.close()
                return {"success": True, "id": existing[0], "message": f"Đã gán học sinh {student_code} vào lớp"}
            cur.close(); conn.close()
            return {"success": False, "error": f"Mã học sinh {student_code} đã tồn tại trong hệ thống!"}

        cur.execute("""INSERT INTO students (student_code, full_name, card_uid, class_id, email, phone)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (student_code, full_name, card_uid, class_id, email, phone))
        conn.commit()
        new_id = cur.lastrowid
        cur.close(); conn.close()
        return {"success": True, "id": new_id, "message": "Đã thêm học sinh vào lớp thành công"}
    except mariadb.Error as e:
        print(f"DB ERROR them_hoc_vien_vao_lop: {e}")
        conn.rollback(); conn.close()
        return {"success": False, "error": str(e)}


def sua_hoc_vien(student_id, student_code=None, full_name=None, card_uid=None, email=None, phone=None):
    """Cập nhật thông tin học sinh trong lớp."""
    conn = ket_noi()
    if not conn:
        return {"success": False, "error": "Không thể kết nối MariaDB"}
    try:
        cur = conn.cursor()
        updates = []
        params = []
        if student_code is not None:
            code = student_code.strip()
            cur.execute("SELECT id, full_name FROM students WHERE student_code = ? AND id != ?", (code, student_id))
            dup_code = cur.fetchone()
            if dup_code:
                cur.close(); conn.close()
                return {"success": False, "error": f"Mã học sinh {code} đã thuộc về học sinh khác ({dup_code[1]})!"}
            updates.append("student_code = ?")
            params.append(code)

        if full_name is not None:
            updates.append("full_name = ?")
            params.append(full_name.strip())

        if card_uid is not None:
            cuid = card_uid.strip().upper() if card_uid.strip() else None
            if cuid:
                cur.execute("SELECT id, student_code, full_name FROM students WHERE UPPER(card_uid) = ? AND id != ?", (cuid, student_id))
                dup_card = cur.fetchone()
                if dup_card:
                    cur.close(); conn.close()
                    return {"success": False, "error": f"Mã thẻ RFID {cuid} đã thuộc về học sinh {dup_card[2]} ({dup_card[1]})!"}
            updates.append("card_uid = ?")
            params.append(cuid)

        if email is not None:
            updates.append("email = ?")
            params.append(email.strip() if email.strip() else None)

        if phone is not None:
            updates.append("phone = ?")
            params.append(phone.strip() if phone.strip() else None)

        if not updates:
            cur.close(); conn.close()
            return {"success": True}

        params.append(student_id)
        cur.execute(f"UPDATE students SET {', '.join(updates)} WHERE id = ?", tuple(params))
        conn.commit()
        cur.close(); conn.close()
        return {"success": True, "message": "Cập nhật thông tin học sinh thành công"}
    except mariadb.Error as e:
        print(f"DB ERROR sua_hoc_vien: {e}")
        conn.rollback(); conn.close()
        return {"success": False, "error": str(e)}


def xoa_hoc_vien(student_id):
    """Xóa hoàn toàn học sinh khỏi hệ thống và khỏi lớp."""
    conn = ket_noi()
    if not conn:
        return False
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM students WHERE id = ?", (student_id,))
        conn.commit()
        affected = cur.rowcount
        cur.close(); conn.close()
        return affected > 0
    except mariadb.Error as e:
        print(f"DB ERROR xoa_hoc_vien: {e}")
        conn.rollback(); conn.close(); return False


def chuyen_lop_hoc_vien(student_id, target_class_id):
    """Chuyển hẳn học sinh từ lớp này sang lớp đích (rời lớp cũ hoàn toàn)."""
    conn = ket_noi()
    if not conn:
        return {"success": False, "error": "Không thể kết nối MariaDB"}
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, class_code, class_name FROM classes WHERE id = ?", (target_class_id,))
        target_cls = cur.fetchone()
        if not target_cls:
            cur.close(); conn.close()
            return {"success": False, "error": "Lớp đích không tồn tại"}

        cur.execute("UPDATE students SET class_id = ? WHERE id = ?", (target_class_id, student_id))
        conn.commit()
        affected = cur.rowcount
        cur.close(); conn.close()
        if affected > 0:
            return {"success": True, "target_class_code": target_cls[1], "target_class_name": target_cls[2],
                    "message": f"Đã chuyển học sinh sang lớp {target_cls[2]} ({target_cls[1]})"}
        return {"success": False, "error": "Không tìm thấy học sinh để chuyển lớp"}
    except mariadb.Error as e:
        print(f"DB ERROR chuyen_lop_hoc_vien: {e}")
        conn.rollback(); conn.close()
        return {"success": False, "error": str(e)}


def gan_the_hoc_vien(student_id, card_uid):
    """Gán/đổi mã thẻ RFID cho học sinh."""
    return sua_hoc_vien(student_id, card_uid=card_uid)


def gan_hoc_vien_vao_lop(class_id, student_id):
    """Gán học sinh có sẵn vào lớp (hàm tương thích)."""
    res = chuyen_lop_hoc_vien(student_id, class_id)
    return res.get("success", False)


def _format_time_value(val):
    if val is None:
        return None
    if isinstance(val, timedelta):
        total_seconds = int(val.total_seconds())
        hours = (total_seconds // 3600) % 24
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    if isinstance(val, time):
        return val.strftime("%H:%M:%S")
    s = str(val).strip()
    parts = s.split(":")
    if len(parts) >= 2:
        try:
            h = int(parts[0])
            m = int(parts[1])
            sec = int(parts[2]) if len(parts) > 2 else 0
            return f"{h:02d}:{m:02d}:{sec:02d}"
        except ValueError:
            pass
    return s


def tao_thoi_khoa_bieu(subject_id, room_id, weekday, start_time, end_time,
                       active_from=None, active_to=None, checkin_open_minutes=15, late_after_minutes=10,
                       class_id=None, teacher_name=None):
    conn = ket_noi()
    if not conn:
        return None
    try:
        cur = conn.cursor()

        # Resolve room_id
        if isinstance(room_id, str) and not room_id.isdigit():
            cur.execute("SELECT id FROM rooms WHERE room_id = ?", (room_id,))
            r_row = cur.fetchone()
            if r_row:
                room_id = r_row[0]
            else:
                cur.close(); conn.close(); return None
        else:
            room_id = int(room_id)

        # Resolve subject_id (int id or string code/name)
        if isinstance(subject_id, str) and not subject_id.isdigit():
            cur.execute("SELECT id FROM subjects WHERE subject_code = ? OR subject_name = ?", (subject_id, subject_id))
            s_row = cur.fetchone()
            if s_row:
                subject_id = s_row[0]
            else:
                cur.execute("INSERT INTO subjects (subject_code, subject_name) VALUES (?, ?)", (subject_id[:20], subject_id))
                conn.commit()
                subject_id = cur.lastrowid
        else:
            subject_id = int(subject_id)

        if not active_from:
            active_from = date.today().isoformat()

        cur.execute("""INSERT INTO schedules
                       (class_id, subject_id, room_id, weekday, start_time, end_time,
                        checkin_open_minutes, late_after_minutes, active_from, active_to)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (class_id, subject_id, room_id, weekday, start_time, end_time,
                     checkin_open_minutes, late_after_minutes, active_from, active_to))
        conn.commit(); result = cur.lastrowid
        cur.close(); conn.close(); return result
    except mariadb.Error as e:
        print(f"DB ERROR tao_thoi_khoa_bieu: {e}"); conn.rollback(); conn.close(); return None


def xoa_thoi_khoa_bieu(schedule_id):
    conn = ket_noi()
    if not conn:
        return False
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM schedules WHERE id = ?", (schedule_id,))
        conn.commit()
        affected = cur.rowcount
        cur.close(); conn.close()
        return affected > 0
    except mariadb.Error as e:
        print(f"DB ERROR xoa_thoi_khoa_bieu: {e}")
        conn.rollback(); conn.close(); return False



def lay_thoi_khoa_bieu(class_id=None, room_id=None):
    conn = ket_noi()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        query = """SELECT s.id, s.class_id, c.class_code, c.class_name,
                   s.subject_id, sub.subject_name,
                   r.room_id, s.weekday, s.start_time, s.end_time,
                   s.checkin_open_minutes, s.late_after_minutes, s.active_from, s.active_to, s.is_active
                   FROM schedules s
                   LEFT JOIN classes c ON c.id = s.class_id
                   JOIN subjects sub ON sub.id=s.subject_id
                   JOIN rooms r ON r.id=s.room_id"""
        conditions = []
        params = []
        if class_id is not None:
            conditions.append("s.class_id = ?")
            params.append(class_id)
        if room_id is not None:
            conditions.append("(r.room_id = ? OR s.room_id = ?)")
            params.extend([room_id, room_id])
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY s.weekday, s.start_time"
        cur.execute(query, tuple(params))
        columns = ["id", "class_id", "class_code", "class_name", "subject_id", "subject_name", "room_id", "weekday", "start_time", "end_time", "checkin_open_minutes", "late_after_minutes", "active_from", "active_to", "is_active"]
        rows = _rows_as_dicts(cur.fetchall(), columns)
        for row in rows:
            for key in ("start_time", "end_time"):
                if row[key] is not None:
                    row[key] = _format_time_value(row[key])
            for key in ("active_from", "active_to"):
                if row[key] is not None:
                    row[key] = row[key].isoformat() if hasattr(row[key], "isoformat") else str(row[key])
            # Compatibility aliases for frontend
            row["day_of_week"] = row["weekday"]
            row["schedule_id"] = row["id"]
            row["late_threshold_minutes"] = row["late_after_minutes"]
        cur.close(); conn.close(); return rows
    except mariadb.Error as e:
        print(f"DB ERROR lay_thoi_khoa_bieu: {e}")
        conn.close()
        return None


def _to_datetime_combine(d, t_val):
    if isinstance(t_val, timedelta):
        return datetime.combine(d, time.min) + t_val
    if isinstance(t_val, time):
        return datetime.combine(d, t_val)
    if isinstance(t_val, str):
        parts = [int(p) for p in t_val.split(":")]
        return datetime.combine(d, time(*parts))
    return datetime.combine(d, time.min)


def lay_hoac_tao_buoi_hoc_hien_tai(room_code, moment=None):
    """Tìm lịch tại phòng đang trong cửa sổ check-in và tạo session của ngày nếu chưa có."""
    moment = moment or datetime.now()
    conn = ket_noi()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute("""SELECT s.id, s.subject_id, s.room_id, s.start_time, s.end_time,
                       s.checkin_open_minutes, s.late_after_minutes, s.class_id, c.class_code, c.class_name
                       FROM schedules s
                       JOIN rooms r ON r.id=s.room_id
                       LEFT JOIN classes c ON c.id=s.class_id
                       WHERE r.room_id=? AND s.weekday=? AND s.is_active=1
                         AND s.active_from <= ? AND (s.active_to IS NULL OR s.active_to >= ?)""",
                    (room_code, moment.isoweekday(), moment.date(), moment.date()))
        schedule = None
        for row in cur.fetchall():
            start = _to_datetime_combine(moment.date(), row[3])
            end = _to_datetime_combine(moment.date(), row[4])
            opens = start - timedelta(minutes=row[5])
            if opens <= moment <= end:
                schedule = row; break
        if not schedule:
            cur.close(); conn.close(); return None
        schedule_id, subject_id, room_id, start_time, end_time, open_minutes, late_minutes, sched_class_id, cls_code, cls_name = schedule
        cur.execute("SELECT id, starts_at, ends_at, checkin_opens_at, late_after_at, status, class_id FROM class_sessions WHERE schedule_id=? AND session_date=?",
                    (schedule_id, moment.date()))
        existing = cur.fetchone()
        if existing:
            cur.execute("UPDATE class_sessions SET status='OPEN' WHERE id=? AND status='SCHEDULED'", (existing[0],))
            conn.commit(); session_id = existing[0]
        else:
            starts_at = _to_datetime_combine(moment.date(), start_time)
            ends_at = _to_datetime_combine(moment.date(), end_time)
            checkin_opens_at = starts_at - timedelta(minutes=open_minutes)
            late_after_at = starts_at + timedelta(minutes=late_minutes)

            cur.execute("""INSERT INTO class_sessions
                           (schedule_id, class_id, subject_id, room_id, session_date, starts_at, ends_at,
                            checkin_opens_at, late_after_at, status)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')""",
                        (schedule_id, sched_class_id, subject_id, room_id, moment.date(), starts_at, ends_at,
                         checkin_opens_at, late_after_at))
            conn.commit(); session_id = cur.lastrowid

        cur.execute("""SELECT cs.id, cs.late_after_at, sub.subject_name,
                              cs.starts_at, cs.ends_at, cs.status,
                              cs.class_id, c.class_code, c.class_name
                       FROM class_sessions cs
                       JOIN subjects sub ON sub.id=cs.subject_id
                       LEFT JOIN classes c ON c.id=cs.class_id
                       WHERE cs.id=?""", (session_id,))
        row = cur.fetchone(); cur.close(); conn.close()
        return {
            "id": row[0],
            "session_id": row[0],
            "late_after_at": row[1],
            "subject_name": row[2],
            "starts_at": row[3],
            "ends_at": row[4],
            "status": row[5],
            "class_id": row[6],
            "class_code": row[7] or "",
            "class_name": row[8] or "",
            "late_after_at_iso": row[1].isoformat() if hasattr(row[1], "isoformat") else str(row[1]) if row[1] else None,
            "starts_at_iso": row[3].isoformat() if hasattr(row[3], "isoformat") else str(row[3]) if row[3] else None,
            "ends_at_iso": row[4].isoformat() if hasattr(row[4], "isoformat") else str(row[4]) if row[4] else None
        }
    except mariadb.Error as e:
        print(f"DB ERROR lay_hoac_tao_buoi_hoc_hien_tai: {e}"); conn.rollback(); conn.close(); return None


def hoc_vien_thuoc_lop(student_id, class_id):
    """Kiểm tra học sinh có thuộc lớp chỉ định không (bảo đảm tính tách biệt)."""
    conn = ket_noi()
    if not conn:
        return False
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM students WHERE id = ? AND class_id = ?", (student_id, class_id))
        result = cur.fetchone() is not None
        cur.close(); conn.close()
        return result
    except mariadb.Error as e:
        print(f"DB ERROR hoc_vien_thuoc_lop: {e}")
        conn.close(); return False


def ghi_nhan_diem_danh(session_id, student_id, checkin_at, status, raw_log_id=None):
    """Trả về True nếu vừa ghi lần quét đầu tiên, False nếu học viên đã điểm danh."""
    conn = ket_noi()
    if not conn:
        return None
    try:
        cur = conn.cursor(); cur.execute("SELECT id FROM attendance_records WHERE session_id=? AND student_id=?", (session_id, student_id))
        if cur.fetchone():
            cur.close(); conn.close(); return False
        cur.execute("""INSERT INTO attendance_records (session_id, student_id, checkin_at, status, source, raw_log_id)
                       VALUES (?, ?, ?, ?, 'RFID', ?)""", (session_id, student_id, checkin_at, status, raw_log_id))
        conn.commit(); cur.close(); conn.close(); return True
    except mariadb.Error as e:
        print(f"DB ERROR ghi_nhan_diem_danh: {e}"); conn.rollback(); conn.close(); return None


def lay_diem_danh_buoi_hoc(session_id):
    conn = ket_noi()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        # Lấy class_id của buổi học để CHỈ hiển thị danh sách học sinh của riêng lớp đó
        cur.execute("SELECT class_id FROM class_sessions WHERE id = ?", (session_id,))
        sess_row = cur.fetchone()
        sess_class_id = sess_row[0] if sess_row else None

        if sess_class_id:
            query = """
                SELECT st.id AS student_id, st.student_code, st.full_name, st.card_uid,
                       COALESCE(ar.status, 'ABSENT') AS status,
                       ar.checkin_at, ar.source, ar.id AS record_id
                FROM students st
                LEFT JOIN attendance_records ar ON ar.session_id = ? AND ar.student_id = st.id
                WHERE st.class_id = ?
                ORDER BY (CASE WHEN ar.status = 'PRESENT' THEN 1 WHEN ar.status = 'LATE' THEN 2 ELSE 3 END), st.student_code
            """
            cur.execute(query, (session_id, sess_class_id))
        else:
            query = """
                SELECT st.id AS student_id, st.student_code, st.full_name, st.card_uid,
                       COALESCE(ar.status, 'ABSENT') AS status,
                       ar.checkin_at, ar.source, ar.id AS record_id
                FROM students st
                LEFT JOIN attendance_records ar ON ar.session_id = ? AND ar.student_id = st.id
                ORDER BY (CASE WHEN ar.status = 'PRESENT' THEN 1 WHEN ar.status = 'LATE' THEN 2 ELSE 3 END), st.student_code
            """
            cur.execute(query, (session_id,))

        columns = ["student_id", "student_code", "full_name", "card_uid", "status", "checkin_at", "source", "record_id"]
        rows = _rows_as_dicts(cur.fetchall(), columns)

        present_count = 0
        late_count = 0
        absent_count = 0

        for row in rows:
            if row["checkin_at"]:
                if hasattr(row["checkin_at"], "isoformat"):
                    row["checkin_at"] = row["checkin_at"].isoformat()
                else:
                    row["checkin_at"] = str(row["checkin_at"])
            row["check_in_time"] = row["checkin_at"]

            if row["status"] == "PRESENT":
                present_count += 1
            elif row["status"] == "LATE":
                late_count += 1
            else:
                absent_count += 1

        summary = {
            "total_students": len(rows),
            "present_count": present_count,
            "late_count": late_count,
            "absent_count": absent_count
        }

        cur.close(); conn.close()
        return {"records": rows, "summary": summary}
    except mariadb.Error as e:
        print(f"DB ERROR lay_diem_danh_buoi_hoc: {e}"); conn.close(); return None


if __name__ == "__main__":
    conn = ket_noi()
    if conn is None:
        print("MariaDB ERROR")
        raise SystemExit(1)
    print("MariaDB OK")
    conn.close()

    sid = tim_sensor_id("room01", "temperature")
    print(f"Sensor temperature: {'OK -> ID ' + str(sid) if sid else 'NOT FOUND'}")

    did = tim_device_id("room01", "light1")
    print(f"Device light1: {'OK -> ID ' + str(did) if did else 'NOT FOUND'}")
    print("================================\n       TEST HOAN TAT\n================================")
