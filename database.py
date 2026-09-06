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
        date_cond = "DATE(att.recorded_at) = CURDATE()" if not ngay else "DATE(att.recorded_at) = ?"
        params = [] if not ngay else [str(ngay)]

        room_cond = ""
        params_with_room = list(params)
        if room_id:
            room_cond = " AND (r.room_id = ? OR r.id = ?)"
            params_with_room.extend([str(room_id), str(room_id)])

        # Đã quẹt thẻ check-in
        query_checkin = f"""
            SELECT COUNT(DISTINCT att.student_id), COUNT(DISTINCT att.card_uid)
            FROM attendance_logs att
            JOIN rooms r ON att.room_id = r.id
            WHERE att.event_type = 'CHECK_IN' AND {date_cond} {room_cond}
        """
        cur.execute(query_checkin, tuple(params_with_room))
        r_checkin = cur.fetchone()
        present_students = r_checkin[0] or 0
        unknown_cards = (r_checkin[1] or 0) - present_students
        if unknown_cards < 0:
            unknown_cards = 0

        # Đi muộn (chấp nhận cả DI_MUON và MUON để tương thích dữ liệu)
        query_late = f"""
            SELECT COUNT(DISTINCT att.student_id)
            FROM attendance_logs att
            JOIN rooms r ON att.room_id = r.id
            WHERE att.event_type = 'CHECK_IN' AND att.status IN ('DI_MUON', 'MUON') AND {date_cond} {room_cond}
        """
        cur.execute(query_late, tuple(params_with_room))
        late_count = cur.fetchone()[0] or 0

        # Vắng mặt: Nếu lọc theo phòng, lấy số lượng sinh viên của các lớp có lịch học trong phòng đó
        if room_id:
            cur.execute("""
                SELECT COUNT(DISTINCT ce.student_id)
                FROM schedules sc
                JOIN rooms r ON sc.room_id = r.id
                JOIN class_enrollments ce ON sc.class_id = ce.class_id
                WHERE (r.room_id = ? OR r.id = ?)
            """, (str(room_id), str(room_id)))
            r_sched = cur.fetchone()
            if r_sched and r_sched[0] > 0:
                total_students = r_sched[0]

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


# ============================================================
# PHÂN HỆ ĐIỂM DANH LỚP HỌC (ACADEMIC ATTENDANCE SYSTEM)
# ============================================================

def lay_danh_sach_mon_hoc():
    conn = ket_noi()
    if conn is None:
        return []
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, subject_code, name, credits, created_at FROM subjects ORDER BY id ASC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [
            {
                "id": r[0],
                "subject_code": r[1],
                "name": r[2],
                "credits": r[3],
                "created_at": r[4].isoformat() if r[4] else None
            }
            for r in rows
        ]
    except mariadb.Error as e:
        print(f"DB ERROR lay_danh_sach_mon_hoc: {e}")
        if conn:
            conn.close()
        return []


def them_mon_hoc(subject_code, name, credits=3):
    conn = ket_noi()
    if conn is None:
        return False, "Khong the ket noi CSDL"
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO subjects (subject_code, name, credits) VALUES (?, ?, ?)",
            (subject_code.strip(), name.strip(), credits)
        )
        conn.commit()
        new_id = cur.lastrowid
        cur.close()
        conn.close()
        return True, new_id
    except mariadb.Error as e:
        print(f"DB ERROR them_mon_hoc: {e}")
        conn.rollback()
        conn.close()
        return False, f"Lỗi thêm môn học: {e}"


def lay_danh_sach_lop_hoc_phan():
    conn = ket_noi()
    if conn is None:
        return []
    try:
        cur = conn.cursor()
        query = """
            SELECT 
                c.id, c.class_code, c.subject_id, s.subject_code, s.name AS subject_name,
                c.teacher_name, c.semester,
                COUNT(ce.student_id) AS total_enrolled
            FROM course_classes c
            JOIN subjects s ON c.subject_id = s.id
            LEFT JOIN class_enrollments ce ON c.id = ce.class_id
            GROUP BY c.id
            ORDER BY c.id ASC
        """
        cur.execute(query)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [
            {
                "id": r[0],
                "class_code": r[1],
                "subject_id": r[2],
                "subject_code": r[3],
                "subject_name": r[4],
                "teacher_name": r[5] or "---",
                "semester": r[6] or "---",
                "total_enrolled": r[7]
            }
            for r in rows
        ]
    except mariadb.Error as e:
        print(f"DB ERROR lay_danh_sach_lop_hoc_phan: {e}")
        if conn:
            conn.close()
        return []


def them_lop_hoc_phan(class_code, subject_id, teacher_name=None, semester=None):
    conn = ket_noi()
    if conn is None:
        return False, "Khong the ket noi CSDL"
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO course_classes (class_code, subject_id, teacher_name, semester) VALUES (?, ?, ?, ?)",
            (class_code.strip(), subject_id, teacher_name, semester)
        )
        conn.commit()
        new_id = cur.lastrowid
        cur.close()
        conn.close()
        return True, new_id
    except mariadb.Error as e:
        print(f"DB ERROR them_lop_hoc_phan: {e}")
        conn.rollback()
        conn.close()
        return False, f"Lỗi tạo lớp học phần: {e}"


def gan_sinh_vien_vao_lop(class_id, student_id):
    conn = ket_noi()
    if conn is None:
        return False, "Khong the ket noi CSDL"
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT IGNORE INTO class_enrollments (class_id, student_id) VALUES (?, ?)",
            (class_id, student_id)
        )
        conn.commit()
        cur.close()
        conn.close()
        return True, "Thành công"
    except mariadb.Error as e:
        print(f"DB ERROR gan_sinh_vien_vao_lop: {e}")
        conn.rollback()
        conn.close()
        return False, str(e)


def lay_sinh_vien_trong_lop(class_id):
    conn = ket_noi()
    if conn is None:
        return []
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT s.id, s.student_code, s.full_name, s.card_uid, s.class_name, ce.enrolled_at
            FROM class_enrollments ce
            JOIN students s ON ce.student_id = s.id
            WHERE ce.class_id = ?
            ORDER BY s.student_code ASC
        """, (class_id,))
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
                "enrolled_at": r[5].isoformat() if r[5] else None
            }
            for r in rows
        ]
    except mariadb.Error as e:
        print(f"DB ERROR lay_sinh_vien_trong_lop: {e}")
        if conn:
            conn.close()
        return []


def lay_thoi_khoa_bieu(room_id=None, class_id=None):
    conn = ket_noi()
    if conn is None:
        return []
    try:
        cur = conn.cursor()
        query = """
            SELECT 
                sc.id, sc.class_id, c.class_code, s.name AS subject_name,
                sc.room_id, r.room_id AS room_code, r.name AS room_name,
                sc.day_of_week, sc.start_time, sc.end_time, sc.late_grace_period_mins
            FROM schedules sc
            JOIN course_classes c ON sc.class_id = c.id
            JOIN subjects s ON c.subject_id = s.id
            JOIN rooms r ON sc.room_id = r.id
            WHERE 1=1
        """
        params = []
        if room_id:
            query += " AND (r.room_id = ? OR r.id = ?)"
            params.extend([str(room_id), str(room_id)])
        if class_id:
            query += " AND sc.class_id = ?"
            params.append(class_id)

        query += " ORDER BY sc.day_of_week ASC, sc.start_time ASC"
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [
            {
                "id": r[0],
                "class_id": r[1],
                "class_code": r[2],
                "subject_name": r[3],
                "room_id": r[4],
                "room_code": r[5],
                "room_name": r[6],
                "day_of_week": r[7],
                "start_time": str(r[8]),
                "end_time": str(r[9]),
                "late_grace_period_mins": r[10]
            }
            for r in rows
        ]
    except mariadb.Error as e:
        print(f"DB ERROR lay_thoi_khoa_bieu: {e}")
        if conn:
            conn.close()
        return []


def tim_hoac_tao_session_hien_tai(room_id, at_datetime=None):
    """
    Xác định hoặc khởi tạo Buổi học (attendance_session) đang diễn ra tại phòng học.
    Đồng thời tự động khởi tạo bản ghi điểm danh (attendance_records) cho toàn bộ SV trong lớp.
    """
    conn = ket_noi()
    if conn is None:
        return None

    import datetime
    if at_datetime is None:
        at_datetime = datetime.datetime.now()

    current_date = at_datetime.date()
    current_time = at_datetime.time()
    day_of_week = at_datetime.weekday()  # 0: Monday, 6: Sunday

    try:
        cur = conn.cursor()

        # 1. Tìm ID số nguyên của room
        cur.execute("SELECT id FROM rooms WHERE room_id = ? OR id = ? LIMIT 1", (str(room_id), str(room_id)))
        r_row = cur.fetchone()
        if not r_row:
            cur.close()
            conn.close()
            return None
        room_db_id = r_row[0]

        # 2. Kiểm tra xem đã có session ACTIVE hoặc UPCOMING trong ngày hôm nay ở khung giờ này chưa
        cur.execute("""
            SELECT id, class_id, room_id, session_date, start_time, end_time, status
            FROM attendance_sessions
            WHERE room_id = ? AND session_date = ?
              AND start_time <= ? AND end_time >= ?
              AND status IN ('ACTIVE', 'UPCOMING')
            LIMIT 1
        """, (room_db_id, current_date, current_time, current_time))
        s_row = cur.fetchone()

        if s_row:
            cur.close()
            conn.close()
            return {
                "id": s_row[0],
                "class_id": s_row[1],
                "room_id": s_row[2],
                "session_date": str(s_row[3]),
                "start_time": str(s_row[4]),
                "end_time": str(s_row[5]),
                "status": s_row[6]
            }

        # 3. Nếu chưa có session trong DB, tra cứu theo thời khóa biểu (schedules)
        cur.execute("""
            SELECT id, class_id, start_time, end_time, late_grace_period_mins
            FROM schedules
            WHERE room_id = ? AND day_of_week = ?
              AND start_time <= ? AND end_time >= ?
            LIMIT 1
        """, (room_db_id, day_of_week, current_time, current_time))
        sched_row = cur.fetchone()

        if not sched_row:
            cur.close()
            conn.close()
            return None

        sched_id, class_id, start_time, end_time, late_mins = sched_row

        # 4. Tự động sinh session mới
        cur.execute("""
            INSERT INTO attendance_sessions (schedule_id, class_id, room_id, session_date, start_time, end_time, status)
            VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
        """, (sched_id, class_id, room_db_id, current_date, start_time, end_time))
        session_id = cur.lastrowid

        # 5. Khởi tạo danh sách sinh viên của lớp với trạng thái ABSENT_UNEXCUSED
        cur.execute("""
            INSERT IGNORE INTO attendance_records (session_id, student_id, status, method)
            SELECT ?, student_id, 'ABSENT_UNEXCUSED', 'AUTO_ABSENT'
            FROM class_enrollments
            WHERE class_id = ?
        """, (session_id, class_id))

        conn.commit()
        cur.close()
        conn.close()

        return {
            "id": session_id,
            "class_id": class_id,
            "room_id": room_db_id,
            "session_date": str(current_date),
            "start_time": str(start_time),
            "end_time": str(end_time),
            "status": "ACTIVE",
            "late_grace_period_mins": late_mins
        }

    except mariadb.Error as e:
        print(f"DB ERROR tim_hoac_tao_session_hien_tai: {e}")
        if conn:
            conn.rollback()
            conn.close()
        return None


def ghi_nhan_diem_danh_sinh_vien(session_id, student_id, status='PRESENT', method='RFID', note=None):
    """
    Ghi nhận hoặc cập nhật kết quả điểm danh cho sinh viên trong buổi học.
    Đảm bảo mỗi SV chỉ có 1 kết quả duy nhất cho session.
    """
    conn = ket_noi()
    if conn is None:
        return False, "Khong the ket noi CSDL"

    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO attendance_records (session_id, student_id, status, checkin_time, method, note)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
            ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                checkin_time = COALESCE(checkin_time, CURRENT_TIMESTAMP),
                method = VALUES(method),
                note = COALESCE(VALUES(note), note),
                updated_at = CURRENT_TIMESTAMP
        """, (session_id, student_id, status, method, note))
        conn.commit()
        cur.close()
        conn.close()
        return True, "Ghi nhận điểm danh thành công"
    except mariadb.Error as e:
        print(f"DB ERROR ghi_nhan_diem_danh_sinh_vien: {e}")
        conn.rollback()
        conn.close()
        return False, str(e)


def lay_bang_diem_danh_buoi_hoc(session_id):
    """
    Lấy toàn bộ danh sách sinh viên của buổi học kèm trạng thái điểm danh chi tiết.
    """
    conn = ket_noi()
    if conn is None:
        return None

    try:
        cur = conn.cursor()
        query = """
            SELECT 
                s.id, s.student_code, s.full_name, s.card_uid, s.class_name,
                ar.id AS record_id, ar.status, ar.checkin_time, ar.method, ar.note
            FROM attendance_sessions ses
            JOIN class_enrollments ce ON ses.class_id = ce.class_id
            JOIN students s ON ce.student_id = s.id
            LEFT JOIN attendance_records ar ON ses.id = ar.session_id AND s.id = ar.student_id
            WHERE ses.id = ?
            ORDER BY s.student_code ASC
        """
        cur.execute(query, (session_id,))
        rows = cur.fetchall()
        cur.close()
        conn.close()

        return [
            {
                "student_id": r[0],
                "student_code": r[1],
                "full_name": r[2],
                "card_uid": r[3],
                "class_name": r[4],
                "record_id": r[5],
                "status": r[6] or "ABSENT_UNEXCUSED",
                "checkin_time": r[7].isoformat() if r[7] else None,
                "method": r[8] or "AUTO_ABSENT",
                "note": r[9] or ""
            }
            for r in rows
        ]
    except mariadb.Error as e:
        print(f"DB ERROR lay_bang_diem_danh_buoi_hoc: {e}")
        if conn:
            conn.close()
        return None


def cap_nhat_diem_danh_thu_cong(record_id, status, note=None):
    """
    Cho phép Giảng viên / Quản trị viên sửa trạng thái điểm danh thủ công (Overrule).
    """
    conn = ket_noi()
    if conn is None:
        return False, "Khong the ket noi CSDL"

    try:
        cur = conn.cursor()
        # Kiểm tra bản ghi có tồn tại không
        cur.execute("SELECT id FROM attendance_records WHERE id = ?", (record_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return False, "Không tìm thấy bản ghi điểm danh"

        cur.execute("""
            UPDATE attendance_records
            SET status = ?, method = 'MANUAL_TEACHER', note = ?
            WHERE id = ?
        """, (status, note, record_id))
        conn.commit()
        cur.close()
        conn.close()
        return True, "Cập nhật điểm danh thành công"
    except mariadb.Error as e:
        print(f"DB ERROR cap_nhat_diem_danh_thu_cong: {e}")
        conn.rollback()
        conn.close()
        return False, str(e)


def dong_buoi_diem_danh(session_id):
    """
    Chốt sổ buổi học: chuyển trạng thái session sang CLOSED.
    """
    conn = ket_noi()
    if conn is None:
        return False, "Khong the ket noi CSDL"

    try:
        cur = conn.cursor()
        cur.execute("UPDATE attendance_sessions SET status = 'CLOSED' WHERE id = ?", (session_id,))
        conn.commit()
        cur.close()
        conn.close()
        return True, "Đã đóng buổi điểm danh"
    except mariadb.Error as e:
        print(f"DB ERROR dong_buoi_diem_danh: {e}")
        conn.rollback()
        conn.close()
        return False, str(e)


def lay_danh_sach_sessions(room_id=None, session_date=None, class_id=None):
    """
    Lấy danh sách các buổi học kèm số liệu thống kê sĩ số, có mặt, muộn, vắng.
    """
    conn = ket_noi()
    if conn is None:
        return []

    try:
        cur = conn.cursor()
        query = """
            SELECT 
                ses.id, ses.class_id, c.class_code, s.subject_code, s.name AS subject_name,
                c.teacher_name, c.semester,
                ses.room_id, r.room_id AS room_code, r.name AS room_name,
                ses.session_date, ses.start_time, ses.end_time, ses.status,
                COUNT(ar.id) AS total_enrolled,
                SUM(CASE WHEN ar.status = 'PRESENT' THEN 1 ELSE 0 END) AS present_count,
                SUM(CASE WHEN ar.status = 'LATE' THEN 1 ELSE 0 END) AS late_count,
                SUM(CASE WHEN ar.status = 'ABSENT_EXCUSED' THEN 1 ELSE 0 END) AS excused_count,
                SUM(CASE WHEN ar.status = 'ABSENT_UNEXCUSED' THEN 1 ELSE 0 END) AS unexcused_count
            FROM attendance_sessions ses
            JOIN course_classes c ON ses.class_id = c.id
            JOIN subjects s ON c.subject_id = s.id
            JOIN rooms r ON ses.room_id = r.id
            LEFT JOIN attendance_records ar ON ses.id = ar.session_id
            WHERE 1=1
        """
        params = []
        if room_id:
            query += " AND (r.room_id = ? OR r.id = ?)"
            params.extend([str(room_id), str(room_id)])
        if session_date:
            query += " AND ses.session_date = ?"
            params.append(str(session_date))
        if class_id:
            query += " AND ses.class_id = ?"
            params.append(class_id)

        query += " GROUP BY ses.id ORDER BY ses.session_date DESC, ses.start_time DESC"
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        cur.close()
        conn.close()

        return [
            {
                "id": r[0],
                "class_id": r[1],
                "class_code": r[2],
                "subject_code": r[3],
                "subject_name": r[4],
                "teacher_name": r[5] or "---",
                "semester": r[6] or "---",
                "room_id": r[7],
                "room_code": r[8],
                "room_name": r[9],
                "session_date": str(r[10]),
                "start_time": str(r[11]),
                "end_time": str(r[12]),
                "status": r[13],
                "total_enrolled": r[14] or 0,
                "present_count": int(r[15] or 0),
                "late_count": int(r[16] or 0),
                "excused_count": int(r[17] or 0),
                "unexcused_count": int(r[18] or 0)
            }
            for r in rows
        ]
    except mariadb.Error as e:
        print(f"DB ERROR lay_danh_sach_sessions: {e}")
        if conn:
            conn.close()
        return []


def dong_tat_ca_session_qua_gio():
    """
    Tự động đóng tất cả các buổi học của ngày cũ hoặc đã qua giờ kết thúc.
    """
    conn = ket_noi()
    if conn is None:
        return 0
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE attendance_sessions
            SET status = 'CLOSED'
            WHERE status = 'ACTIVE' 
              AND (session_date < CURDATE() OR (session_date = CURDATE() AND end_time < CURTIME()))
        """)
        conn.commit()
        count = cur.rowcount
        cur.close()
        conn.close()
        return count
    except mariadb.Error as e:
        return 0


def tao_session_moi(room_id, class_id, session_date=None, start_time=None, end_time=None):
    """
    Tạo một buổi học mới thủ công hoặc đột xuất, tự động nạp sinh viên của lớp vào sổ điểm danh.
    """
    conn = ket_noi()
    if conn is None:
        return False, None, "Không thể kết nối CSDL"

    import datetime
    if not session_date:
        session_date = datetime.date.today()
    
    now = datetime.datetime.now()
    if not start_time:
        start_time = now.strftime("%H:%M:00")
    if not end_time:
        # Mặc định kết thúc sau 3 tiếng hoặc 23:59:59
        end_dt = now + datetime.timedelta(hours=3)
        end_time = end_dt.strftime("%H:%M:00")

    try:
        cur = conn.cursor()
        # Tìm ID phòng
        cur.execute("SELECT id FROM rooms WHERE room_id = ? OR id = ? LIMIT 1", (str(room_id), str(room_id)))
        r_row = cur.fetchone()
        if not r_row:
            cur.close()
            conn.close()
            return False, None, "Phòng học không tồn tại"
        room_db_id = r_row[0]

        # Kiểm tra lớp học phần tồn tại
        cur.execute("SELECT id FROM course_classes WHERE id = ?", (class_id,))
        c_row = cur.fetchone()
        if not c_row:
            cur.close()
            conn.close()
            return False, None, "Lớp học phần không tồn tại"

        # Tạo session mới
        cur.execute("""
            INSERT INTO attendance_sessions (class_id, room_id, session_date, start_time, end_time, status)
            VALUES (?, ?, ?, ?, ?, 'ACTIVE')
        """, (class_id, room_db_id, session_date, start_time, end_time))
        session_id = cur.lastrowid

        # Tự động nạp sinh viên vào attendance_records
        cur.execute("""
            INSERT IGNORE INTO attendance_records (session_id, student_id, status, method)
            SELECT ?, student_id, 'ABSENT_UNEXCUSED', 'AUTO_ABSENT'
            FROM class_enrollments
            WHERE class_id = ?
        """, (session_id, class_id))

        conn.commit()
        cur.close()
        conn.close()
        return True, session_id, "Tạo buổi học thành công"

    except mariadb.Error as e:
        print(f"DB ERROR tao_session_moi: {e}")
        if conn:
            conn.rollback()
            conn.close()
        return False, None, f"Lỗi tạo buổi học: {e}"


if __name__ == "__main__":

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