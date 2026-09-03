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
