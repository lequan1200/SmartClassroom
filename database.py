import mariadb
from datetime import datetime, timedelta

DB_HOST = "127.0.0.1"
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
            SELECT id, student_code, full_name, card_uid, class_name
            FROM students WHERE UPPER(card_uid) = UPPER(?)
        """, (card_uid.strip(),))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return None
        return {"id": row[0], "student_code": row[1], "full_name": row[2], "card_uid": row[3], "class_name": row[4]}
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
                       c.is_active, COUNT(cs.student_id) AS student_count
                       FROM classes c LEFT JOIN class_students cs
                       ON cs.class_id = c.id AND cs.status = 'ACTIVE'
                       GROUP BY c.id ORDER BY c.class_code""")
        rows = _rows_as_dicts(cur.fetchall(), ["id", "class_code", "class_name", "academic_year", "description", "is_active", "student_count"])
        cur.close(); conn.close()
        return rows
    except mariadb.Error as e:
        print(f"DB ERROR lay_danh_sach_lop: {e}"); conn.close(); return None


def tao_lop(class_code, class_name, academic_year=None, description=None):
    conn = ket_noi()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute("INSERT INTO classes (class_code, class_name, academic_year, description) VALUES (?, ?, ?, ?)",
                    (class_code, class_name, academic_year, description))
        conn.commit(); result = cur.lastrowid
        cur.close(); conn.close()
        return result
    except mariadb.Error as e:
        print(f"DB ERROR tao_lop: {e}"); conn.rollback(); conn.close(); return None


def lay_danh_sach_mon_hoc():
    conn = ket_noi()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, subject_code, subject_name, description, is_active FROM subjects ORDER BY subject_code")
        rows = _rows_as_dicts(cur.fetchall(), ["id", "subject_code", "subject_name", "description", "is_active"])
        cur.close(); conn.close(); return rows
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
        cur.close(); conn.close(); return result
    except mariadb.Error as e:
        print(f"DB ERROR tao_mon_hoc: {e}"); conn.rollback(); conn.close(); return None


def gan_hoc_vien_vao_lop(class_id, student_id):
    conn = ket_noi()
    if not conn:
        return False
    try:
        cur = conn.cursor()
        cur.execute("""INSERT INTO class_students (class_id, student_id, status, left_at)
                       VALUES (?, ?, 'ACTIVE', NULL)
                       ON DUPLICATE KEY UPDATE status = 'ACTIVE', left_at = NULL""", (class_id, student_id))
        conn.commit(); cur.close(); conn.close(); return True
    except mariadb.Error as e:
        print(f"DB ERROR gan_hoc_vien_vao_lop: {e}"); conn.rollback(); conn.close(); return False


def lay_hoc_vien_cua_lop(class_id):
    conn = ket_noi()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute("""SELECT st.id, st.student_code, st.full_name, st.card_uid, cs.status
                       FROM class_students cs JOIN students st ON st.id = cs.student_id
                       WHERE cs.class_id = ? ORDER BY st.student_code""", (class_id,))
        rows = _rows_as_dicts(cur.fetchall(), ["id", "student_code", "full_name", "card_uid", "status"])
        cur.close(); conn.close(); return rows
    except mariadb.Error as e:
        print(f"DB ERROR lay_hoc_vien_cua_lop: {e}"); conn.close(); return None


def tao_thoi_khoa_bieu(class_id, subject_id, room_id, weekday, start_time, end_time,
                       active_from, active_to=None, checkin_open_minutes=15, late_after_minutes=10):
    conn = ket_noi()
    if not conn:
        return None
    try:
        cur = conn.cursor()
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


def lay_thoi_khoa_bieu(class_id=None):
    conn = ket_noi()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        query = """SELECT s.id, s.class_id, c.class_code, s.subject_id, sub.subject_name,
                   r.room_id, s.weekday, s.start_time, s.end_time, s.checkin_open_minutes,
                   s.late_after_minutes, s.active_from, s.active_to, s.is_active
                   FROM schedules s JOIN classes c ON c.id=s.class_id
                   JOIN subjects sub ON sub.id=s.subject_id JOIN rooms r ON r.id=s.room_id"""
        params = ()
        if class_id is not None:
            query += " WHERE s.class_id = ?"; params = (class_id,)
        query += " ORDER BY s.weekday, s.start_time"
        cur.execute(query, params)
        columns = ["id", "class_id", "class_code", "subject_id", "subject_name", "room_id", "weekday", "start_time", "end_time", "checkin_open_minutes", "late_after_minutes", "active_from", "active_to", "is_active"]
        rows = _rows_as_dicts(cur.fetchall(), columns)
        for row in rows:
            for key in ("start_time", "end_time", "active_from", "active_to"):
                if row[key] is not None: row[key] = row[key].isoformat()
        cur.close(); conn.close(); return rows
    except mariadb.Error as e:
        print(f"DB ERROR lay_thoi_khoa_bieu: {e}"); conn.close(); return None


def lay_hoac_tao_buoi_hoc_hien_tai(room_code, moment=None):
    """Tìm lịch tại phòng đang trong cửa sổ check-in và tạo session của ngày nếu chưa có."""
    moment = moment or datetime.now()
    conn = ket_noi()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute("""SELECT s.id, s.class_id, s.subject_id, s.room_id, s.start_time, s.end_time,
                       s.checkin_open_minutes, s.late_after_minutes
                       FROM schedules s JOIN rooms r ON r.id=s.room_id
                       WHERE r.room_id=? AND s.weekday=? AND s.is_active=1
                         AND s.active_from <= ? AND (s.active_to IS NULL OR s.active_to >= ?)""",
                    (room_code, moment.isoweekday(), moment.date(), moment.date()))
        schedule = None
        for row in cur.fetchall():
            start = datetime.combine(moment.date(), row[4])
            end = datetime.combine(moment.date(), row[5])
            opens = start - timedelta(minutes=row[6])
            if opens <= moment <= end:
                schedule = row; break
        if not schedule:
            cur.close(); conn.close(); return None
        schedule_id, class_id, subject_id, room_id, start_time, end_time, open_minutes, late_minutes = schedule
        cur.execute("SELECT id, starts_at, ends_at, checkin_opens_at, late_after_at, status FROM class_sessions WHERE schedule_id=? AND session_date=?",
                    (schedule_id, moment.date()))
        existing = cur.fetchone()
        if existing:
            cur.execute("UPDATE class_sessions SET status='OPEN' WHERE id=? AND status='SCHEDULED'", (existing[0],))
            conn.commit(); session_id = existing[0]
        else:
            starts_at = datetime.combine(moment.date(), start_time)
            ends_at = datetime.combine(moment.date(), end_time)
            checkin_opens_at = starts_at - timedelta(minutes=open_minutes)
            late_after_at = starts_at + timedelta(minutes=late_minutes)
            cur.execute("""INSERT INTO class_sessions
                           (schedule_id, class_id, subject_id, room_id, session_date, starts_at, ends_at,
                            checkin_opens_at, late_after_at, status)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')""",
                        (schedule_id, class_id, subject_id, room_id, moment.date(), starts_at, ends_at,
                         checkin_opens_at, late_after_at))
            conn.commit(); session_id = cur.lastrowid
        cur.execute("""SELECT cs.id, cs.class_id, cs.late_after_at, c.class_code, sub.subject_name
                       FROM class_sessions cs JOIN classes c ON c.id=cs.class_id
                       JOIN subjects sub ON sub.id=cs.subject_id WHERE cs.id=?""", (session_id,))
        row = cur.fetchone(); cur.close(); conn.close()
        return {"id": row[0], "class_id": row[1], "late_after_at": row[2], "class_code": row[3], "subject_name": row[4]}
    except mariadb.Error as e:
        print(f"DB ERROR lay_hoac_tao_buoi_hoc_hien_tai: {e}"); conn.rollback(); conn.close(); return None


def hoc_vien_thuoc_lop(student_id, class_id):
    conn = ket_noi()
    if not conn:
        return False
    try:
        cur = conn.cursor(); cur.execute("SELECT 1 FROM class_students WHERE student_id=? AND class_id=? AND status='ACTIVE'", (student_id, class_id))
        result = cur.fetchone() is not None; cur.close(); conn.close(); return result
    except mariadb.Error as e:
        print(f"DB ERROR hoc_vien_thuoc_lop: {e}"); conn.close(); return False


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
        cur.execute("""SELECT ar.id, st.student_code, st.full_name, ar.status, ar.checkin_at, ar.source
                       FROM attendance_records ar JOIN students st ON st.id=ar.student_id
                       WHERE ar.session_id=? ORDER BY ar.checkin_at, st.student_code""", (session_id,))
        rows = _rows_as_dicts(cur.fetchall(), ["id", "student_code", "full_name", "status", "checkin_at", "source"])
        for row in rows:
            if row["checkin_at"]: row["checkin_at"] = row["checkin_at"].isoformat()
        cur.close(); conn.close(); return rows
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
