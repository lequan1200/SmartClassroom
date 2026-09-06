import mariadb

DB_HOST = "127.0.0.1"
DB_PORT = 3306
DB_USER = "root"
DB_PASSWORD = "1234"
DB_NAME = "smartclassroom"


def ket_noi():
    try:
        return mariadb.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
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
        cursor.execute(
            """
            SELECT sensors.id
            FROM sensors
            JOIN rooms ON sensors.room_id = rooms.id
            WHERE rooms.room_id = ? AND sensors.sensor_name = ?
            """,
            (room_id, sensor_name)
        )
        result = cursor.fetchone()

        # Ho tro chuyen doi tuong thich giua door va RFID
        if result is None:
            alias = "RFID" if str(sensor_name).lower() == "door" else ("door" if str(sensor_name).lower() == "rfid" else None)
            if alias:
                cursor.execute(
                    """
                    SELECT sensors.id
                    FROM sensors
                    JOIN rooms ON sensors.room_id = rooms.id
                    WHERE rooms.room_id = ? AND sensors.sensor_name = ?
                    """,
                    (room_id, alias)
                )
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
        cursor.execute(
            "INSERT INTO sensor_data (sensor_id, value) VALUES (?, ?)",
            (sensor_id, value)
        )
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
        cursor.execute(
            """
            INSERT INTO sensor_current (sensor_id, value)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE
                value = VALUES(value),
                updated_at = CURRENT_TIMESTAMP
            """,
            (sensor_id, value)
        )
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
        cursor.execute(
            """
            SELECT devices.id
            FROM devices
            JOIN rooms ON devices.room_id = rooms.id
            WHERE rooms.room_id = ? AND devices.device_name = ?
            """,
            (room_id, device_name)
        )
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
        cursor.execute(
            """
            INSERT INTO device_current (device_id, state)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE
                state = VALUES(state),
                updated_at = CURRENT_TIMESTAMP
            """,
            (device_id, state)
        )
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
        cursor.execute(
            "INSERT INTO device_logs (device_id, action) VALUES (?, ?)",
            (device_id, action)
        )
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
        cursor.execute(
            """
            SELECT
                sensors.sensor_name,
                sensors.unit,
                sensor_current.value,
                sensor_current.updated_at
            FROM sensors
            JOIN rooms ON sensors.room_id = rooms.id
            LEFT JOIN sensor_current ON sensors.id = sensor_current.sensor_id
            WHERE rooms.room_id = ?
            ORDER BY sensors.id
            """,
            (room_id,)
        )
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        return [
            {
                "sensor_name": row[0],
                "unit": row[1],
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
        cursor.execute(
            """
            SELECT
                devices.device_name,
                devices.device_type,
                device_current.state,
                device_current.updated_at
            FROM devices
            JOIN rooms ON devices.room_id = rooms.id
            LEFT JOIN device_current ON devices.id = device_current.device_id
            WHERE rooms.room_id = ?
            ORDER BY devices.id
            """,
            (room_id,)
        )
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        return [
            {
                "device_name": row[0],
                "device_type": row[1],
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
                "id": row[0],
                "room_id": row[1],
                "name": row[2],
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
        cursor.execute(
            "SELECT id, room_id, name, created_at, control_mode FROM rooms WHERE room_id = ?",
            (room_id,)
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if row is None:
            return None

        return {
            "id": row[0],
            "room_id": row[1],
            "name": row[2],
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
        cursor.execute(
            "SELECT control_mode FROM rooms WHERE room_id = ?",
            (room_id,)
        )
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
        cursor.execute(
            "UPDATE rooms SET control_mode = ? WHERE room_id = ?",
            (mode, room_id)
        )
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
        cursor.execute(
            """
            SELECT
                sensors.id,
                sensors.sensor_name,
                sensors.sensor_type,
                sensors.unit,
                sensor_current.value,
                sensor_current.updated_at
            FROM sensors
            JOIN rooms ON sensors.room_id = rooms.id
            LEFT JOIN sensor_current ON sensors.id = sensor_current.sensor_id
            WHERE rooms.room_id = ? AND sensors.sensor_name = ?
            """,
            (room_id, sensor_name)
        )
        row = cursor.fetchone()

        # Ho tro alias giua door va RFID
        if row is None:
            alias = "RFID" if str(sensor_name).lower() == "door" else ("door" if str(sensor_name).lower() == "rfid" else None)
            if alias:
                cursor.execute(
                    """
                    SELECT
                        sensors.id,
                        sensors.sensor_name,
                        sensors.sensor_type,
                        sensors.unit,
                        sensor_current.value,
                        sensor_current.updated_at
                    FROM sensors
                    JOIN rooms ON sensors.room_id = rooms.id
                    LEFT JOIN sensor_current ON sensors.id = sensor_current.sensor_id
                    WHERE rooms.room_id = ? AND sensors.sensor_name = ?
                    """,
                    (room_id, alias)
                )
                row = cursor.fetchone()

        cursor.close()
        conn.close()

        if row is None:
            return None

        return {
            "id": row[0],
            "sensor_name": row[1],
            "sensor_type": row[2],
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

        if limit < 1:
            limit = 1
        if limit > 1000:
            limit = 1000

        cursor.execute(
            """
            SELECT
                sensor_data.value,
                sensor_data.recorded_at
            FROM sensor_data
            JOIN sensors ON sensor_data.sensor_id = sensors.id
            JOIN rooms ON sensors.room_id = rooms.id
            WHERE rooms.room_id = ? AND sensors.sensor_name = ?
            ORDER BY sensor_data.recorded_at DESC
            LIMIT ?
            """,
            (room_id, sensor_name, limit)
        )
        rows = cursor.fetchall()

        if not rows:
            alias = "RFID" if str(sensor_name).lower() == "door" else ("door" if str(sensor_name).lower() == "rfid" else None)
            if alias:
                cursor.execute(
                    """
                    SELECT
                        sensor_data.value,
                        sensor_data.recorded_at
                    FROM sensor_data
                    JOIN sensors ON sensor_data.sensor_id = sensors.id
                    JOIN rooms ON sensors.room_id = rooms.id
                    WHERE rooms.room_id = ? AND sensors.sensor_name = ?
                    ORDER BY sensor_data.recorded_at DESC
                    LIMIT ?
                    """,
                    (room_id, alias, limit)
                )
                rows = cursor.fetchall()

        cursor.close()
        conn.close()

        return [
            {
                "value": float(row[0]),
                "recorded_at": row[1].isoformat() if row[1] else None
            }
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
        cursor.execute(
            """
            SELECT
                devices.id,
                devices.device_name,
                devices.device_type,
                device_current.state,
                device_current.updated_at
            FROM devices
            JOIN rooms ON devices.room_id = rooms.id
            LEFT JOIN device_current ON devices.id = device_current.device_id
            WHERE rooms.room_id = ? AND devices.device_name = ?
            """,
            (room_id, device_name)
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if row is None:
            return None

        return {
            "id": row[0],
            "device_name": row[1],
            "device_type": row[2],
            "state": row[3],
            "updated_at": row[4].isoformat() if row[4] else None
        }
    except mariadb.Error as e:
        print(f"DB ERROR: {e}")
        if conn:
            conn.close()
# ============================================================
# QUẢN LÝ HỌC VIÊN & THẺ RFID
# ============================================================

def lay_danh_sach_hoc_vien():
    conn = ket_noi()
    if conn is None:
        return None
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, student_code, full_name, card_uid, class_name, email, phone, created_at
            FROM students
            ORDER BY student_code ASC
            """
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [
            {
                "id": r[0],
                "student_code": r[1],
                "full_name": r[2],
                "card_uid": r[3],
                "class_name": r[4],
                "email": r[5],
                "phone": r[6],
                "created_at": r[7].isoformat() if r[7] else None
            }
            for r in rows
        ]
    except mariadb.Error as e:
        print(f"DB ERROR lay_danh_sach_hoc_vien: {e}")
        if conn:
            conn.close()
        return None


def tim_hoc_vien_theo_card(card_uid):
    if not card_uid:
        return None
    conn = ket_noi()
    if conn is None:
        return None
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, student_code, full_name, card_uid, class_name
            FROM students
            WHERE UPPER(card_uid) = UPPER(?)
            """,
            (card_uid.strip(),)
        )
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
            "class_name": row[4]
        }
    except mariadb.Error as e:
        print(f"DB ERROR tim_hoc_vien_theo_card: {e}")
        if conn:
            conn.close()
        return None


def them_hoc_vien(student_code, full_name, class_name=None, card_uid=None, email=None, phone=None):
    if not student_code or not full_name:
        return False, "Thiếu mã học viên hoặc họ tên"

    card_uid = card_uid.strip().upper() if card_uid and card_uid.strip() else None

    conn = ket_noi()
    if conn is None:
        return False, "Không thể kết nối MariaDB"

    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO students (student_code, full_name, card_uid, class_name, email, phone)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (student_code.strip(), full_name.strip(), card_uid, class_name, email, phone)
        )
        conn.commit()
        new_id = cur.lastrowid
        cur.close()
        conn.close()
        return True, new_id
    except mariadb.IntegrityError as e:
        conn.rollback()
        conn.close()
        err = str(e)
        if "student_code" in err:
            return False, f"Mã học viên '{student_code}' đã tồn tại"
        if "card_uid" in err:
            return False, f"Mã thẻ RFID '{card_uid}' đã được gán cho học viên khác"
        return False, f"Lỗi trùng lặp dữ liệu: {e}"
    except mariadb.Error as e:
        print(f"DB ERROR them_hoc_vien: {e}")
        conn.rollback()
        conn.close()
        return False, f"Lỗi cơ sở dữ liệu: {e}"


def sua_hoc_vien(student_id, student_code, full_name, class_name=None, card_uid=None, email=None, phone=None):
    if not student_code or not full_name:
        return False, "Thiếu mã học viên hoặc họ tên"

    card_uid = card_uid.strip().upper() if card_uid and card_uid.strip() else None

    conn = ket_noi()
    if conn is None:
        return False, "Không thể kết nối MariaDB"

    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE students
            SET student_code = ?, full_name = ?, card_uid = ?, class_name = ?, email = ?, phone = ?
            WHERE id = ?
            """,
            (student_code.strip(), full_name.strip(), card_uid, class_name, email, phone, student_id)
        )
        conn.commit()
        cur.close()
        conn.close()
        return True, "Cập nhật học viên thành công"
    except mariadb.IntegrityError as e:
        conn.rollback()
        conn.close()
        err = str(e)
        if "student_code" in err:
            return False, f"Mã học viên '{student_code}' đã tồn tại"
        if "card_uid" in err:
            return False, f"Mã thẻ RFID '{card_uid}' đã được gán cho học viên khác"
        return False, f"Lỗi dữ liệu: {e}"
    except mariadb.Error as e:
        print(f"DB ERROR sua_hoc_vien: {e}")
        conn.rollback()
        conn.close()
        return False, f"Lỗi cơ sở dữ liệu: {e}"


def xoa_hoc_vien(student_id):
    conn = ket_noi()
    if conn is None:
        return False, "Không thể kết nối MariaDB"
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM students WHERE id = ?", (student_id,))
        conn.commit()
        cur.close()
        conn.close()
        return True, "Xóa học viên thành công"
    except mariadb.Error as e:
        print(f"DB ERROR xoa_hoc_vien: {e}")
        conn.rollback()
        conn.close()
        return False, f"Lỗi cơ sở dữ liệu: {e}"


def gan_the_hoc_vien(student_id, card_uid):
    card_uid = card_uid.strip().upper() if card_uid and card_uid.strip() else None
    conn = ket_noi()
    if conn is None:
        return False, "Không thể kết nối MariaDB"
    try:
        cur = conn.cursor()
        cur.execute("UPDATE students SET card_uid = ? WHERE id = ?", (card_uid, student_id))
        conn.commit()
        cur.close()
        conn.close()
        return True, "Gán thẻ thành công"
    except mariadb.IntegrityError:
        conn.rollback()
        conn.close()
        return False, f"Mã thẻ '{card_uid}' đã được gán cho học viên khác"
    except mariadb.Error as e:
        print(f"DB ERROR gan_the_hoc_vien: {e}")
        conn.rollback()
        conn.close()
        return False, f"Lỗi cơ sở dữ liệu: {e}"


# ============================================================
# QUẢN LÝ ĐIỂM DANH (ATTENDANCE LOGS)
# ============================================================

def luu_attendance_log(room_id, card_uid, event_type="CHECK_IN", status="DUNG_GIO", recorded_at=None):
    card_uid = card_uid.strip().upper() if card_uid else ""
    if not card_uid:
        return False

    conn = ket_noi()
    if conn is None:
        return False

    try:
        cur = conn.cursor()

        # 1. Tìm room database id (id số nguyên từ rooms)
        room_db_id = 1
        if isinstance(room_id, int):
            room_db_id = room_id
        else:
            cur.execute("SELECT id FROM rooms WHERE room_id = ?", (str(room_id),))
            r_row = cur.fetchone()
            if r_row:
                room_db_id = r_row[0]

        # 2. Tìm student_id từ card_uid
        cur.execute("SELECT id FROM students WHERE UPPER(card_uid) = UPPER(?)", (card_uid,))
        s_row = cur.fetchone()
        student_id = s_row[0] if s_row else None

        # 3. Ghi vào attendance_logs
        if recorded_at:
            cur.execute(
                """
                INSERT INTO attendance_logs (room_id, student_id, card_uid, event_type, status, recorded_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (room_db_id, student_id, card_uid, event_type, status, recorded_at)
            )
        else:
            cur.execute(
                """
                INSERT INTO attendance_logs (room_id, student_id, card_uid, event_type, status)
                VALUES (?, ?, ?, ?, ?)
                """,
                (room_db_id, student_id, card_uid, event_type, status)
            )
        conn.commit()
        cur.close()
        conn.close()
        return True
    except mariadb.Error as e:
        print(f"DB ERROR luu_attendance_log: {e}")
        conn.rollback()
        conn.close()
        return False


def lay_danh_sach_diem_danh(room_id=None, limit=50, ngay=None, date_filter=None):
    if not ngay and date_filter:
        ngay = date_filter
    conn = ket_noi()
    if conn is None:
        return None
    try:
        cur = conn.cursor()
        query = """
            SELECT
                att.id,
                r.room_id,
                r.name AS room_name,
                att.card_uid,
                att.student_id,
                st.student_code,
                st.full_name,
                st.class_name,
                att.event_type,
                att.status,
                att.recorded_at
            FROM attendance_logs att
            JOIN rooms r ON att.room_id = r.id
            LEFT JOIN students st ON att.student_id = st.id
            WHERE 1=1
        """
        params = []
        if room_id:
            query += " AND r.room_id = ?"
            params.append(str(room_id))
        if ngay:
            query += " AND DATE(att.recorded_at) = ?"
            params.append(str(ngay))

        query += " ORDER BY att.recorded_at DESC LIMIT ?"
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            limit = 50
        params.append(min(max(1, limit), 500))

        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        cur.close()
        conn.close()

        return [
            {
                "id": r[0],
                "room_id": r[1],
                "room_name": r[2],
                "card_uid": r[3],
                "student_id": r[4],
                "student_code": r[5] or "---",
                "full_name": r[6] or "Chưa đăng ký thẻ",
                "class_name": r[7] or "---",
                "event_type": r[8],
                "status": r[9] or "NORMAL",
                "recorded_at": r[10].isoformat() if r[10] else None
            }
            for r in rows
        ]
    except mariadb.Error as e:
        print(f"DB ERROR lay_danh_sach_diem_danh: {e}")
        if conn:
            conn.close()
        return None


def lay_thong_ke_diem_danh(room_id=None, ngay=None, date_filter=None):
    if not ngay and date_filter:
        ngay = date_filter
    conn = ket_noi()
    if conn is None:
        return None
    try:
        cur = conn.cursor()

        # 1. Tổng số học viên
        cur.execute("SELECT COUNT(*) FROM students")
        total_students = cur.fetchone()[0]

        # 2. Thống kê theo ngày (mặc định hôm nay)
        date_filter = "DATE(recorded_at) = CURDATE()" if not ngay else "DATE(recorded_at) = ?"
        params = [] if not ngay else [str(ngay)]

        # Đã quẹt thẻ check-in
        query_checkin = f"""
            SELECT COUNT(DISTINCT student_id), COUNT(DISTINCT card_uid)
            FROM attendance_logs
            WHERE event_type = 'CHECK_IN' AND {date_filter}
        """
        cur.execute(query_checkin, tuple(params))
        r_checkin = cur.fetchone()
        present_students = r_checkin[0] or 0
        unknown_cards = (r_checkin[1] or 0) - present_students
        if unknown_cards < 0:
            unknown_cards = 0

        # Đi muộn
        query_late = f"""
            SELECT COUNT(DISTINCT student_id)
            FROM attendance_logs
            WHERE event_type = 'CHECK_IN' AND status = 'DI_MUON' AND {date_filter}
        """
        cur.execute(query_late, tuple(params))
        late_count = cur.fetchone()[0] or 0

        # Vắng mặt
        absent_count = max(0, total_students - present_students)

        cur.close()
        conn.close()

        return {
            "total_students": total_students,
            "present_students": present_students,
            "late_count": late_count,
            "on_time_count": max(0, present_students - late_count),
            "absent_count": absent_count,
            "unknown_cards": unknown_cards
        }
    except mariadb.Error as e:
        print(f"DB ERROR lay_thong_ke_diem_danh: {e}")
        if conn:
            conn.close()
        return None


if __name__ == "__main__":
    print("================================")
    print("       DATABASE TEST")
    print("================================")

    conn = ket_noi()
    if conn is None:
        print("MariaDB ERROR")
        raise SystemExit(1)

    print("MariaDB OK")
    conn.close()

    sensor_id = tim_sensor_id("room01", "temperature")
    if sensor_id is not None:
        print(f"Sensor OK: temperature -> ID {sensor_id}")
    else:
        print("Sensor NOT FOUND: room01 / temperature")

    rfid_id = tim_sensor_id("room01", "RFID")
    if rfid_id is not None:
        print(f"Sensor OK: RFID -> ID {rfid_id}")
    else:
        print("Sensor NOT FOUND: room01 / RFID")

    device_id = tim_device_id("room01", "light1")
    if device_id is not None:
        print(f"Device OK: light1 -> ID {device_id}")
    else:
        print("Device NOT FOUND: room01 / light1")

    print("================================")
    print("       TEST HOAN TAT")
    print("================================")