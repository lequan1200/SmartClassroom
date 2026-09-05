import json
from datetime import datetime

import paho.mqtt.client as mqtt

from database import (
    tim_sensor_id,
    luu_sensor_data,
    cap_nhat_sensor_current,
    tim_device_id,
    cap_nhat_device_current,
    luu_device_log
)


# ============================================================
# CẤU HÌNH MQTT
# ============================================================

MQTT_BROKER = "127.0.0.1"
MQTT_PORT = 1883

# Giữ nguyên chuẩn topic của project
MQTT_TOPIC = "classroom/#"


# ============================================================
# PHÂN TÍCH TOPIC
# ============================================================

def phan_tich_topic(topic):

    parts = topic.split("/")

    if len(parts) < 3:
        return None

    # --------------------------------------------------------
    # Kiểm tra prefix
    # --------------------------------------------------------

    if parts[0] != "classroom":
        return None

    room_id = parts[1]
    loai = parts[2]


    # ========================================================
    # SENSOR
    #
    # classroom/room01/sensor/temperature
    # ========================================================

    if loai == "sensor" and len(parts) == 4:

        return {
            "room_id": room_id,
            "loai": "sensor",
            "ten": parts[3]
        }


    # ========================================================
    # DEVICE
    #
    # classroom/room01/device/light/set
    # classroom/room01/device/light/status
    # ========================================================

    if loai == "device" and len(parts) == 5:

        return {
            "room_id": room_id,
            "loai": "device",
            "ten": parts[3],
            "hanh_dong": parts[4]
        }


    # ========================================================
    # ATTENDANCE
    #
    # classroom/room01/attendance
    # ========================================================

    if loai == "attendance" and len(parts) == 3:

        return {
            "room_id": room_id,
            "loai": "attendance"
        }


    # ========================================================
    # ALERT
    #
    # classroom/room01/alert
    # ========================================================

    if loai == "alert" and len(parts) == 3:

        return {
            "room_id": room_id,
            "loai": "alert"
        }


    return None


# ============================================================
# MQTT CONNECT CALLBACK
# ============================================================

def khi_ket_noi(
    client,
    userdata,
    flags,
    reason_code,
    properties
):

    if reason_code == 0:

        print("MQTT OK")

        result = client.subscribe(
            MQTT_TOPIC,
            qos=1
        )

        if result[0] == mqtt.MQTT_ERR_SUCCESS:

            print(
                f"SUB {MQTT_TOPIC}"
            )

        else:

            print(
                f"SUB ERROR: {result[0]}"
            )

    else:

        print(
            f"MQTT ERROR: {reason_code}"
        )


# ============================================================
# MQTT DISCONNECT CALLBACK
# ============================================================

def khi_ngat_ket_noi(
    client,
    userdata,
    disconnect_flags,
    reason_code,
    properties
):

    print(
        f"MQTT DISCONNECTED: {reason_code}"
    )


# ============================================================
# MQTT MESSAGE CALLBACK
# ============================================================

def khi_nhan_message(
    client,
    userdata,
    message
):

    topic = message.topic


    # ========================================================
    # DECODE PAYLOAD
    # ========================================================

    try:

        payload = message.payload.decode(
            "utf-8"
        )

    except UnicodeDecodeError:

        print(
            "PAYLOAD ERROR"
        )

        return


    timestamp = datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )


    print()
    print("========== MQTT RX ==========")
    print(f"Topic: {topic}")
    print(f"Payload: {payload}")
    print(f"TIME: {timestamp}")
    print("=============================")


    # ========================================================
    # PHÂN TÍCH TOPIC
    # ========================================================

    thong_tin = phan_tich_topic(
        topic
    )


    if thong_tin is None:

        print(
            "TOPIC ERROR"
        )

        return


    # ========================================================
    # PARSE JSON
    # ========================================================

    try:

        data = json.loads(
            payload
        )

    except json.JSONDecodeError:

        print(
            "JSON ERROR"
        )

        return


    if not isinstance(data, dict):

        print(
            "JSON ERROR: payload phai la object"
        )

        return


    # ========================================================
    # SENSOR
    # ========================================================

    if thong_tin["loai"] == "sensor":

        xu_ly_sensor(
            thong_tin,
            data
        )


    # ========================================================
    # DEVICE
    # ========================================================

    elif thong_tin["loai"] == "device":

        xu_ly_device(
            thong_tin,
            data
        )


    # ========================================================
    # ATTENDANCE
    # ========================================================

    elif thong_tin["loai"] == "attendance":

        xu_ly_attendance(
            thong_tin,
            data
        )


    # ========================================================
    # ALERT
    # ========================================================

    elif thong_tin["loai"] == "alert":

        xu_ly_alert(
            thong_tin,
            data
        )


# ============================================================
# XỬ LÝ SENSOR
# ============================================================

def xu_ly_sensor(
    thong_tin,
    data
):

    value = data.get(
        "value"
    )

    unit = data.get(
        "unit"
    )


    # --------------------------------------------------------
    # Kiểm tra value
    # --------------------------------------------------------

    if not isinstance(
        value,
        (int, float)
    ):

        print(
            "SENSOR ERROR: value khong hop le"
        )

        return


    room_id = thong_tin[
        "room_id"
    ]

    sensor_name = thong_tin[
        "ten"
    ]


    # --------------------------------------------------------
    # Tìm sensor ID
    # --------------------------------------------------------

    sensor_id = tim_sensor_id(
        room_id,
        sensor_name
    )


    if sensor_id is None:

        print(
            f"SENSOR NOT FOUND: "
            f"{room_id}/{sensor_name}"
        )

        return


    # --------------------------------------------------------
    # Lưu lịch sử
    # --------------------------------------------------------

    if not luu_sensor_data(
        sensor_id,
        value
    ):

        print(
            "SENSOR HISTORY ERROR"
        )

        return


    # --------------------------------------------------------
    # Cập nhật current
    # --------------------------------------------------------

    if not cap_nhat_sensor_current(
        sensor_id,
        value
    ):

        print(
            "SENSOR CURRENT ERROR"
        )

        return


    print(
        f"SENSOR DB OK | "
        f"{room_id} | "
        f"{sensor_name} | "
        f"{value} {unit or ''}"
    )


# ============================================================
# XỬ LÝ DEVICE
# ============================================================

def xu_ly_device(
    thong_tin,
    data
):

    room_id = thong_tin[
        "room_id"
    ]

    device_name = thong_tin[
        "ten"
    ]

    action = thong_tin[
        "hanh_dong"
    ]


    print(
        f"DEVICE | "
        f"{room_id} | "
        f"{device_name} | "
        f"{action} | "
        f"{data}"
    )


    # --------------------------------------------------------
    # Chỉ xử lý STATUS
    # --------------------------------------------------------

    if action != "status":

        print(
            "DEVICE COMMAND - "
            "KHONG LUU DATABASE"
        )

        return


    # --------------------------------------------------------
    # Lấy state
    # --------------------------------------------------------

    state = data.get(
        "state"
    )


    if not isinstance(
        state,
        str
    ):

        print(
            "DEVICE STATE ERROR"
        )

        return


    state = state.upper()


    # --------------------------------------------------------
    # Kiểm tra state
    # --------------------------------------------------------

    if state not in [
        "ON",
        "OFF",
        "ONLINE"
    ]:

        print(
            f"DEVICE STATE INVALID: "
            f"{state}"
        )

        return


    # --------------------------------------------------------
    # Tìm device ID
    # --------------------------------------------------------

    device_id = tim_device_id(
        room_id,
        device_name
    )


    if device_id is None:

        print(
            f"DEVICE NOT FOUND: "
            f"{room_id}/{device_name}"
        )

        return


    # --------------------------------------------------------
    # Cập nhật current
    # --------------------------------------------------------

    if not cap_nhat_device_current(
        device_id,
        state
    ):

        print(
            "DEVICE CURRENT ERROR"
        )

        return


    # --------------------------------------------------------
    # Lưu lịch sử
    # --------------------------------------------------------

    if not luu_device_log(
        device_id,
        state
    ):

        print(
            "DEVICE LOG ERROR"
        )

        return


    print(
        f"DEVICE DB OK | "
        f"device_id={device_id} | "
        f"state={state}"
    )


# ============================================================
# XỬ LÝ ATTENDANCE
# ============================================================

def xu_ly_attendance(
    thong_tin,
    data
):

    room_id = thong_tin[
        "room_id"
    ]


    print(
        f"ATTENDANCE | "
        f"{room_id} | "
        f"{data}"
    )


    # --------------------------------------------------------
    # Hiện tại chỉ nhận dữ liệu.
    #
    # Chưa ghi MariaDB vì database.py hiện tại
    # chưa có hàm attendance.
    # --------------------------------------------------------


# ============================================================
# XỬ LÝ ALERT
# ============================================================

def xu_ly_alert(
    thong_tin,
    data
):

    room_id = thong_tin[
        "room_id"
    ]


    print(
        f"ALERT | "
        f"{room_id} | "
        f"{data}"
    )


    # --------------------------------------------------------
    # Hiện tại chỉ nhận dữ liệu.
    #
    # Chưa ghi MariaDB vì database.py hiện tại
    # chưa có hàm alerts.
    # --------------------------------------------------------


# ============================================================
# MQTT CLIENT
# ============================================================

client = mqtt.Client(
    mqtt.CallbackAPIVersion.VERSION2,
    client_id="raspberry-pi-backend"
)


client.on_connect = khi_ket_noi

client.on_disconnect = khi_ngat_ket_noi

client.on_message = khi_nhan_message


# ============================================================
# KẾT NỐI MQTT
# ============================================================

def ket_noi_mqtt():

    try:

        client.connect(
            MQTT_BROKER,
            MQTT_PORT,
            60
        )

        print(
            "MQTT CONNECT OK"
        )

        return True

    except Exception as e:

        print(
            f"MQTT CONNECT ERROR: {e}"
        )

        return False


# ============================================================
# GỬI COMMAND CHO DEVICE
# ============================================================

def gui_lenh_thiet_bi(
    room_id,
    device_name,
    command
):

    command = str(
        command
    ).upper()


    # --------------------------------------------------------
    # Kiểm tra command
    # --------------------------------------------------------

    if command not in [
        "ON",
        "OFF"
    ]:

        return (
            False,
            "Command chi chap nhan ON hoac OFF"
        )


    # ========================================================
    # TOPIC
    #
    # classroom/room01/device/light/set
    # ========================================================

    topic = (
        f"classroom/"
        f"{room_id}/"
        f"device/"
        f"{device_name}/"
        f"set"
    )


    # ========================================================
    # PAYLOAD
    # ========================================================

    payload = {
        "command": command
    }


    payload_json = json.dumps(
        payload
    )


    # ========================================================
    # PUBLISH
    # ========================================================

    try:

        result = client.publish(
            topic,
            payload_json,
            qos=1
        )


        if result.rc != mqtt.MQTT_ERR_SUCCESS:

            print(
                f"MQTT PUBLISH ERROR: "
                f"{result.rc}"
            )

            return (
                False,
                "Khong the publish MQTT"
            )


        print()
        print("========== MQTT TX ==========")

        print(
            f"Topic: {topic}"
        )

        print(
            f"Payload: {payload_json}"
        )

        print("=============================")


        return (
            True,
            "Command da gui"
        )


    except Exception as e:

        print(
            f"MQTT PUBLISH ERROR: {e}"
        )

        return (
            False,
            "MQTT publish error"
        )


# ============================================================
# CHẠY MQTT ĐỘC LẬP
# ============================================================

if __name__ == "__main__":

    print()
    print("========================================")
    print("     SMART CLASSROOM MQTT BACKEND")
    print("========================================")


    if not ket_noi_mqtt():

        raise SystemExit(1)


    try:

        print(
            "MQTT LOOP START"
        )

        client.loop_forever()


    except KeyboardInterrupt:

        print()
        print(
            "MQTT STOP"
        )


    finally:

        client.disconnect()