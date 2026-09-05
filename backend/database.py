import mariadb


# =====================================================
# CẤU HÌNH DATABASE
# =====================================================

DB_HOST = "127.0.0.1"
DB_PORT = 3306
DB_USER = "root"
DB_PASSWORD = "1234"
DB_NAME = "smartclassroom"


# =====================================================
# KẾT NỐI MARIADB
# =====================================================

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


# =====================================================
# TÌM SENSOR ID
# =====================================================

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
            JOIN rooms
                ON sensors.room_id = rooms.id
            WHERE rooms.room_id = ?
              AND sensors.sensor_name = ?
            """,
            (room_id, sensor_name)
        )

        result = cursor.fetchone()

        cursor.close()
        conn.close()

        if result:
            return result[0]

        return None

    except mariadb.Error as e:
        print(f"DB ERROR: {e}")

        if conn:
            conn.close()

        return None


# =====================================================
# LƯU LỊCH SỬ SENSOR
# =====================================================

def luu_sensor_data(sensor_id, value):
    conn = ket_noi()

    if conn is None:
        return False

    try:
        cursor = conn.cursor()

        cursor.execute(
            """
            INSERT INTO sensor_data
                (sensor_id, value)
            VALUES
                (?, ?)
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


# =====================================================
# CẬP NHẬT GIÁ TRỊ SENSOR HIỆN TẠI
# =====================================================

def cap_nhat_sensor_current(sensor_id, value):
    conn = ket_noi()

    if conn is None:
        return False

    try:
        cursor = conn.cursor()

        cursor.execute(
            """
            INSERT INTO sensor_current
                (sensor_id, value)
            VALUES
                (?, ?)
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


# =====================================================
# TÌM DEVICE ID
# =====================================================

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
            JOIN rooms
                ON devices.room_id = rooms.id
            WHERE rooms.room_id = ?
              AND devices.device_name = ?
            """,
            (room_id, device_name)
        )

        result = cursor.fetchone()

        cursor.close()
        conn.close()

        if result:
            return result[0]

        return None

    except mariadb.Error as e:
        print(f"DB ERROR: {e}")

        if conn:
            conn.close()

        return None


# =====================================================
# CẬP NHẬT TRẠNG THÁI THIẾT BỊ HIỆN TẠI
# =====================================================

def cap_nhat_device_current(device_id, state):
    conn = ket_noi()

    if conn is None:
        return False

    try:
        cursor = conn.cursor()

        cursor.execute(
            """
            INSERT INTO device_current
                (device_id, state)
            VALUES
                (?, ?)
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


# =====================================================
# LƯU LỊCH SỬ THIẾT BỊ
# =====================================================

def luu_device_log(device_id, action):
    conn = ket_noi()

    if conn is None:
        return False

    try:
        cursor = conn.cursor()

        cursor.execute(
            """
            INSERT INTO device_logs
                (device_id, action)
            VALUES
                (?, ?)
            """,
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
# =====================================================
# LAY SENSOR HIEN TAI CUA MOT PHONG
# =====================================================

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
            JOIN rooms
                ON sensors.room_id = rooms.id
            LEFT JOIN sensor_current
                ON sensors.id = sensor_current.sensor_id
            WHERE rooms.room_id = ?
            ORDER BY sensors.id
            """,
            (room_id,)
        )

        rows = cursor.fetchall()

        cursor.close()
        conn.close()

        danh_sach_sensor = []

        for row in rows:
            danh_sach_sensor.append({
                "sensor_name": row[0],
                "unit": row[1],
                "value": float(row[2]) if row[2] is not None else None,
                "updated_at": row[3].isoformat()
                if row[3] else None
            })

        return danh_sach_sensor

    except mariadb.Error as e:
        print(f"DB ERROR: {e}")

        if conn:
            conn.close()

        return None
# =====================================================
# LAY DEVICE HIEN TAI CUA MOT PHONG
# =====================================================

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
            JOIN rooms
                ON devices.room_id = rooms.id
            LEFT JOIN device_current
                ON devices.id = device_current.device_id
            WHERE rooms.room_id = ?
            ORDER BY devices.id
            """,
            (room_id,)
        )

        rows = cursor.fetchall()

        cursor.close()
        conn.close()

        danh_sach_device = []

        for row in rows:
            danh_sach_device.append({
                "device_name": row[0],
                "device_type": row[1],
                "state": row[2],
                "updated_at": row[3].isoformat()
                if row[3] else None
            })

        return danh_sach_device

    except mariadb.Error as e:
        print(f"DB ERROR: {e}")

        if conn:
            conn.close()

        return None

# =====================================================
# L?Y DANH SÁCH PHÒNG
# =====================================================

def lay_danh_sach_phong():
    conn = ket_noi()

    if conn is None:
        return None

    try:
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT id, room_id, name, created_at
            FROM rooms
            ORDER BY id
            """
        )

        rows = cursor.fetchall()

        cursor.close()
        conn.close()

        danh_sach_phong = []

        for row in rows:
            danh_sach_phong.append({
                "id": row[0],
                "room_id": row[1],
                "name": row[2],
                "created_at": row[3].isoformat()
                if row[3] else None
            })

        return danh_sach_phong

    except mariadb.Error as e:
        print(f"DB ERROR: {e}")

        if conn:
            conn.close()

        return None
# ============================================================
# LAY THONG TIN MOT PHONG
# ============================================================

def lay_phong(room_id):

    conn = ket_noi()

    if conn is None:
        return None

    try:

        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                id,
                room_id,
                name,
                created_at
            FROM rooms
            WHERE room_id = ?
        """, (room_id,))

        row = cursor.fetchone()

        cursor.close()
        conn.close()

        if row is None:
            return None

        return {
            "id": row[0],
            "room_id": row[1],
            "name": row[2],
            "created_at": row[3].isoformat()
                if row[3] else None
        }

    except mariadb.Error as e:

        print(f"DB ERROR: {e}")

        if conn:
            conn.close()

        return None


# ============================================================
# LAY MOT SENSOR
# ============================================================

def lay_sensor(room_id, sensor_name):

    conn = ket_noi()

    if conn is None:
        return None

    try:

        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                sensors.id,
                sensors.sensor_name,
                sensors.sensor_type,
                sensors.unit,
                sensor_current.value,
                sensor_current.updated_at
            FROM sensors
            JOIN rooms
                ON sensors.room_id = rooms.id
            LEFT JOIN sensor_current
                ON sensors.id = sensor_current.sensor_id
            WHERE rooms.room_id = ?
              AND sensors.sensor_name = ?
        """, (room_id, sensor_name))

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
            "value": float(row[4])
                if row[4] is not None else None,
            "updated_at": row[5].isoformat()
                if row[5] else None
        }

    except mariadb.Error as e:

        print(f"DB ERROR: {e}")

        if conn:
            conn.close()

        return None


# ============================================================
# LAY MOT DEVICE
# ============================================================
# ============================================================
# LAY LICH SU MOT SENSOR
# ============================================================

def lay_sensor_history(room_id, sensor_name, limit=100):

    conn = ket_noi()

    if conn is None:
        return None

    try:

        cursor = conn.cursor()

        # ----------------------------------------------------
        # Kiem tra limit
        # ----------------------------------------------------

        try:
            limit = int(limit)
        except (TypeError, ValueError):
            limit = 100

        if limit < 1:
            limit = 1

        if limit > 1000:
            limit = 1000

        # ----------------------------------------------------
        # Lay lich su sensor
        # ----------------------------------------------------

        query = """
            SELECT
                sensor_data.value,
                sensor_data.recorded_at
            FROM sensor_data
            JOIN sensors
                ON sensor_data.sensor_id = sensors.id
            JOIN rooms
                ON sensors.room_id = rooms.id
            WHERE rooms.room_id = ?
              AND sensors.sensor_name = ?
            ORDER BY sensor_data.recorded_at DESC
            LIMIT ?
        """

        cursor.execute(
            query,
            (room_id, sensor_name, limit)
        )

        rows = cursor.fetchall()

        cursor.close()
        conn.close()

        lich_su = []

        for row in rows:

            lich_su.append({
                "value": float(row[0]),
                "recorded_at": (
                    row[1].isoformat()
                    if row[1] else None
                )
            })

        return lich_su

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
            SELECT
                devices.id,
                devices.device_name,
                devices.device_type,
                device_current.state,
                device_current.updated_at
            FROM devices
            JOIN rooms
                ON devices.room_id = rooms.id
            LEFT JOIN device_current
                ON devices.id = device_current.device_id
            WHERE rooms.room_id = ?
              AND devices.device_name = ?
        """, (room_id, device_name))

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
            "updated_at": row[4].isoformat()
                if row[4] else None
        }

    except mariadb.Error as e:

        print(f"DB ERROR: {e}")

        if conn:
            conn.close()

        return None
# =====================================================
# TEST DATABASE
# =====================================================

if __name__ == "__main__":

    print("================================")
    print("       DATABASE TEST")
    print("================================")

    # -------------------------------------------------
    # Kiểm tra kết nối
    # -------------------------------------------------

    conn = ket_noi()

    if conn is None:
        print("MariaDB ERROR")
        raise SystemExit(1)

    print("MariaDB OK")

    conn.close()

    # -------------------------------------------------
    # Kiểm tra sensor
    # -------------------------------------------------

    sensor_id = tim_sensor_id(
        "room01",
        "temperature"
    )

    if sensor_id is not None:
        print(
            f"Sensor OK: temperature -> ID {sensor_id}"
        )
    else:
        print(
            "Sensor NOT FOUND: room01 / temperature"
        )

    # -------------------------------------------------
    # Kiểm tra device
    # -------------------------------------------------

    device_id = tim_device_id(
        "room01",
        "light"
    )

    if device_id is not None:
        print(
            f"Device OK: light -> ID {device_id}"
        )
    else:
        print(
            "Device NOT FOUND: room01 / light"
        )

    print("================================")
    print("       TEST HOAN TAT")
    print("================================")

