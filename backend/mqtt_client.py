
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


# =====================================================
# CẤU HÌNH MQTT
# =====================================================

MQTT_BROKER = "127.0.0.1"
MQTT_PORT = 1883
MQTT_TOPIC = "classroom/#"


# =====================================================
# PHÂN TÍCH TOPIC
# =====================================================

def phan_tich_topic(topic):

    parts = topic.split("/")

    if len(parts) < 3:
        return None

    if parts[0] != "classroom":
        return None

    room_id = parts[1]
    loai = parts[2]

    # -------------------------------------------------
    # SENSOR
    # classroom/room01/sensor/temperature
    # -------------------------------------------------

    if loai == "sensor" and len(parts) == 4:

        return {
            "room_id": room_id,
            "loai": "sensor",
            "ten": parts[3]
        }

    # -------------------------------------------------
    # DEVICE
    # classroom/room01/device/light/set
    # classroom/room01/device/light/status
    # -------------------------------------------------

    if loai == "device" and len(parts) == 5:

        return {
            "room_id": room_id,
            "loai": "device",
            "ten": parts[3],
            "hanh_dong": parts[4]
        }

    # -------------------------------------------------
    # ATTENDANCE
    # classroom/room01/attendance
    # -------------------------------------------------

    if loai == "attendance" and len(parts) == 3:

        return {
            "room_id": room_id,
            "loai": "attendance"
        }

    # -------------------------------------------------
    # ALERT
    # classroom/room01/alert
    # -------------------------------------------------

    if loai == "alert" and len(parts) == 3:

        return {
            "room_id": room_id,
            "loai": "alert"
        }

    return None


# =====================================================
# MQTT CONNECT
# =====================================================

def khi_ket_noi(
    client,
    userdata,
    flags,
    reason_code,
    properties
):

    if reason_code == 0:

        print("MQTT OK")

        result = client.subscribe(MQTT_TOPIC)

        if result[0] == mqtt.MQTT_ERR_SUCCESS:

            print(f"SUB {MQTT_TOPIC}")

        else:

            print("SUB ERROR")

    else:

        print(f"MQTT ERROR: {reason_code}")


# =====================================================
# MQTT MESSAGE
# =====================================================

def khi_nhan_message(
    client,
    userdata,
    message
):

    topic = message.topic

    # -------------------------------------------------
    # Decode payload
    # -------------------------------------------------

    try:

        payload = message.payload.decode("utf-8")

    except UnicodeDecodeError:

        print("PAYLOAD ERROR")

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

    # -------------------------------------------------
    # Phân tích topic
    # -------------------------------------------------

    thong_tin = phan_tich_topic(topic)

    if thong_tin is None:

        print("TOPIC ERROR")

        return

    # -------------------------------------------------
    # Parse JSON
    # -------------------------------------------------

    try:

        data = json.loads(payload)

    except json.JSONDecodeError:

        print("JSON ERROR")

        return

    if not isinstance(data, dict):

        print("JSON ERROR")

        return


    # =================================================
    # SENSOR
    # =================================================

    if thong_tin["loai"] == "sensor":

        value = data.get("value")

        unit = data.get("unit")

        # -------------------------------------------------
        # Kiểm tra dữ liệu sensor
        # -------------------------------------------------

        if not isinstance(value, (int, float)):

            print("SENSOR ERROR")

            return

        # -------------------------------------------------
        # Tìm sensor ID
        # -------------------------------------------------

        sensor_id = tim_sensor_id(
            thong_tin["room_id"],
            thong_tin["ten"]
        )

        if sensor_id is None:

            print("SENSOR NOT FOUND")

            return

        # -------------------------------------------------
        # Lưu lịch sử sensor
        # -------------------------------------------------

        if not luu_sensor_data(
            sensor_id,
            value
        ):

            print("DB ERROR")

            return

        # -------------------------------------------------
        # Cập nhật sensor hiện tại
        # -------------------------------------------------

        if not cap_nhat_sensor_current(
            sensor_id,
            value
        ):

            print("CURRENT ERROR")

            return

        print(
            f"DB OK | "
            f"{thong_tin['room_id']} | "
            f"{thong_tin['ten']} | "
            f"{value} {unit}"
        )


    # =================================================
    # DEVICE
    # =================================================

    elif thong_tin["loai"] == "device":

        room_id = thong_tin["room_id"]

        device_name = thong_tin["ten"]

        action = thong_tin["hanh_dong"]

        print(
            f"{room_id} | "
            f"{device_name} | "
            f"{action} | "
            f"{data}"
        )

        # -------------------------------------------------
        # Chỉ lưu STATUS
        # -------------------------------------------------

        if action != "status":

            print(
                "DEVICE COMMAND - "
                "KHONG LUU DATABASE"
            )

            return

        # -------------------------------------------------
        # Lấy state
        # -------------------------------------------------

        state = data.get("state")

        if not isinstance(state, str):

            print("DEVICE STATE ERROR")

            return

        state = state.upper()

        # -------------------------------------------------
        # Kiểm tra state
        # -------------------------------------------------

        if state not in [
            "ON",
            "OFF",
            "ONLINE"
        ]:

            print(
                f"DEVICE STATE INVALID: {state}"
            )

            return

        # -------------------------------------------------
        # Tìm device ID
        # -------------------------------------------------

        device_id = tim_device_id(
            room_id,
            device_name
        )

        if device_id is None:

            print("DEVICE NOT FOUND")

            return

        # -------------------------------------------------
        # Cập nhật trạng thái hiện tại
        # -------------------------------------------------

        if not cap_nhat_device_current(
            device_id,
            state
        ):

            print(
                "DEVICE CURRENT ERROR"
            )

            return

        # -------------------------------------------------
        # Lưu lịch sử thiết bị
        # -------------------------------------------------

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


    # =================================================
    # ATTENDANCE
    # =================================================

    elif thong_tin["loai"] == "attendance":

        print(
            f"{thong_tin['room_id']} | "
            f"ATTENDANCE | "
            f"{data}"
        )


    # =================================================
    # ALERT
    # =================================================

    elif thong_tin["loai"] == "alert":

        print(
            f"{thong_tin['room_id']} | "
            f"ALERT | "
            f"{data}"
        )


# =====================================================
# MQTT CLIENT
# =====================================================

client = mqtt.Client(
    mqtt.CallbackAPIVersion.VERSION2,
    client_id="raspberry-pi-backend"
)

client.on_connect = khi_ket_noi

client.on_message = khi_nhan_message


# =====================================================
# START
# =====================================================

print("========================================")

print("     SMART CLASSROOM MQTT BACKEND")

print("========================================")

print("Connecting MQTT...")


try:

    client.connect(
        MQTT_BROKER,
        MQTT_PORT,
        60
    )

except Exception as e:

    print(
        f"MQTT ERROR: {e}"
    )

    raise SystemExit(1)


# =====================================================
# LOOP
# =====================================================

try:

    client.loop_forever()

except KeyboardInterrupt:

    print()

    print("STOP")

    client.disconnect()
