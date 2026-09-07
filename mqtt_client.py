import json
from datetime import datetime

import paho.mqtt.client as mqtt

from database import (
    tim_sensor_id, luu_sensor_data, cap_nhat_sensor_current,
    tim_device_id, cap_nhat_device_current, luu_device_log,
    luu_attendance_log, tim_hoc_vien_theo_card, lay_che_do_phong,
    cap_nhat_che_do_phong, tim_hoac_tao_session_hien_tai,
    lay_sinh_vien_trong_lop, ghi_nhan_diem_danh_sinh_vien
)

MQTT_BROKER = "127.0.0.1"
MQTT_PORT = 1883
MQTT_TOPIC = "classroom/#"


def phan_tich_topic(topic):
    parts = topic.split("/")
    if len(parts) < 3 or parts[0] != "classroom":
        return None

    room_id = parts[1]
    loai = parts[2]

    if loai == "sensor" and len(parts) == 4:
        return {"room_id": room_id, "loai": "sensor", "ten": parts[3]}

    if loai == "device" and len(parts) == 5:
        return {"room_id": room_id, "loai": "device", "ten": parts[3], "hanh_dong": parts[4]}

    if loai == "attendance" and len(parts) == 4 and parts[3] == "feedback":
        return None  # Bỏ qua feedback để tránh vòng lặp

    if loai == "attendance" and len(parts) == 3:
        return {"room_id": room_id, "loai": "attendance"}

    if loai == "alert" and len(parts) == 3:
        return {"room_id": room_id, "loai": "alert"}

    if loai == "mode" and len(parts) == 4:
        return {"room_id": room_id, "loai": "mode", "hanh_dong": parts[3]}

    return None


def khi_ket_noi(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        print("MQTT OK")
        result = client.subscribe(MQTT_TOPIC, qos=1)
        if result[0] == mqtt.MQTT_ERR_SUCCESS:
            print(f"SUB {MQTT_TOPIC}")
        else:
            print(f"SUB ERROR: {result[0]}")
    else:
        print(f"MQTT ERROR: {reason_code}")


def khi_ngat_ket_noi(client, userdata, disconnect_flags, reason_code, properties):
    print(f"MQTT DISCONNECTED: {reason_code}")


def khi_nhan_message(client, userdata, message):
    topic = message.topic

    try:
        payload = message.payload.decode("utf-8")
    except UnicodeDecodeError:
        print("PAYLOAD ERROR")
        return

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n========== MQTT RX ==========\nTopic: {topic}\nPayload: {payload}\nTIME: {timestamp}\n=============================")

    thong_tin = phan_tich_topic(topic)
    if thong_tin is None:
        print("TOPIC ERROR")
        return

    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        print("JSON ERROR")
        return

    if not isinstance(data, dict):
        print("JSON ERROR: payload phai la object")
        return

    loai = thong_tin["loai"]
    if loai == "sensor":
        xu_ly_sensor(thong_tin, data)
    elif loai == "device":
        xu_ly_device(thong_tin, data)
    elif loai == "attendance":
        xu_ly_attendance(thong_tin, data)
    elif loai == "alert":
        xu_ly_alert(thong_tin, data)
    elif loai == "mode":
        xu_ly_mode(thong_tin, data)


def xu_ly_sensor(thong_tin, data):
    room_id = thong_tin["room_id"]
    sensor_name = thong_tin["ten"]
    value = data.get("value")
    unit = data.get("unit")

    if value is None and ("card_uid" in data or "event_type" in data):
        value = 1.0
        if not unit:
            unit = "card"

    if isinstance(value, str):
        try:
            value = float(value)
        except ValueError:
            value = 1.0 if value.upper() in ["1", "ON", "OPEN", "TRUE", "CHECK_IN"] else 0.0

    if not isinstance(value, (int, float)):
        print("SENSOR ERROR: value khong hop le")
        return

    sensor_id = tim_sensor_id(room_id, sensor_name)
    if sensor_id is None:
        print(f"SENSOR NOT FOUND: {room_id}/{sensor_name}")
        return

    if not luu_sensor_data(sensor_id, value):
        print("SENSOR HISTORY ERROR")
        return

    if not cap_nhat_sensor_current(sensor_id, value):
        print("SENSOR CURRENT ERROR")
        return

    print(f"SENSOR DB OK | {room_id} | {sensor_name} | {value} {unit or ''}")

    if "card_uid" in data or "event_type" in data:
        xu_ly_attendance(thong_tin, data)


def xu_ly_device(thong_tin, data):
    room_id = thong_tin["room_id"]
    device_name = thong_tin["ten"]
    action = thong_tin["hanh_dong"]

    print(f"DEVICE | {room_id} | {device_name} | {action} | {data}")

    if action != "status":
        print("DEVICE COMMAND - KHONG LUU DATABASE")
        return

    if device_name.endswith("_mode"):
        mode = data.get("mode") or data.get("state") or data.get("command")
        if mode:
            print(f"DEVICE MODE STATUS | Room: {room_id} | Device: {device_name} -> {str(mode).upper()}")
        return

    state = data.get("state")
    if not isinstance(state, str):
        print("DEVICE STATE ERROR")
        return

    state = state.upper()
    if state not in ["ON", "OFF", "ONLINE"]:
        print(f"DEVICE STATE INVALID: {state}")
        return

    device_id = tim_device_id(room_id, device_name)
    if device_id is None:
        print(f"DEVICE NOT FOUND: {room_id}/{device_name}")
        return

    if not cap_nhat_device_current(device_id, state):
        print("DEVICE CURRENT ERROR")
        return

    if not luu_device_log(device_id, state):
        print("DEVICE LOG ERROR")
        return

    print(f"DEVICE DB OK | device_id={device_id} | state={state}")


def gui_phan_hoi_diem_danh(room_id, feedback_data):
    """Gửi phản hồi điểm danh về ESP32. Topic: classroom/{room_id}/attendance/feedback"""
    topic = f"classroom/{room_id}/attendance/feedback"
    try:
        payload_str = json.dumps(feedback_data, ensure_ascii=False)
        client.publish(topic, payload_str, qos=0)
        print(f"ATTENDANCE FEEDBACK TX -> {topic}: {payload_str}")
    except Exception as e:
        print(f"ATTENDANCE FEEDBACK ERROR: {e}")


def xu_ly_attendance(thong_tin, data):
    room_id = thong_tin["room_id"]
    card_uid = (data.get("card_uid") or data.get("uid") or data.get("card") or "").strip().upper()
    timestamp_str = data.get("timestamp")

    if not card_uid:
        print(f"ATTENDANCE ERROR: Missing card_uid for room {room_id}")
        return

    scan_dt = datetime.now()
    if timestamp_str:
        try:
            scan_dt = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
        except Exception:
            pass

    time_str = scan_dt.strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n========== ATTENDANCE SCAN ==========\nRoom      : {room_id}\nCard UID  : {card_uid}\nScan Time : {time_str}")

    student = tim_hoc_vien_theo_card(card_uid)
    if not student:
        print(f"ATTENDANCE ALERT: Thẻ {card_uid} chưa được gán cho học viên nào!")
        luu_attendance_log(room_id=room_id, card_uid=card_uid, event_type="CHECK_IN", status="CHUA_DANG_KY", recorded_at=time_str)
        gui_phan_hoi_diem_danh(room_id, {"status": "UNKNOWN_CARD", "card_uid": card_uid, "message": "Thẻ chưa đăng ký học viên", "beeps": 3})
        print("=====================================\n")
        return

    student_id = student["id"]
    student_name = student["full_name"]
    student_code = student["student_code"]

    session = tim_hoac_tao_session_hien_tai(room_id, at_datetime=scan_dt)

    if session:
        class_id = session["class_id"]
        students_in_class = lay_sinh_vien_trong_lop(class_id)
        enrolled_ids = [s["id"] for s in students_in_class]

        if student_id not in enrolled_ids:
            print(f"ATTENDANCE REJECT: {student_name} ({student_code}) không thuộc lớp học phần ID={class_id} tại {room_id}!")
            luu_attendance_log(room_id=room_id, card_uid=card_uid, event_type="CHECK_IN", status="KHONG_THUOC_LOP", recorded_at=time_str)
            gui_phan_hoi_diem_danh(room_id, {"status": "NOT_IN_CLASS", "student_name": student_name, "student_code": student_code, "message": "Không thuộc lớp này", "beeps": 3})
            print("=====================================\n")
            return

        start_time_str = session["start_time"]
        late_grace_mins = session.get("late_grace_period_mins") or 15

        try:
            start_parts = [int(p) for p in str(start_time_str).split(":")]
            session_start_dt = scan_dt.replace(hour=start_parts[0], minute=start_parts[1], second=start_parts[2])
        except Exception:
            session_start_dt = scan_dt

        from datetime import timedelta
        grace_limit_dt = session_start_dt + timedelta(minutes=late_grace_mins)

        if scan_dt <= grace_limit_dt:
            rec_status, log_status, msg, beeps = "PRESENT", "DUNG_GIO", "Điểm danh đúng giờ", 1
        else:
            rec_status, log_status, msg, beeps = "LATE", "DI_MUON", "Điểm danh muộn", 2

        ghi_nhan_diem_danh_sinh_vien(session_id=session["id"], student_id=student_id, status=rec_status, method="RFID")

        log_id = luu_attendance_log(room_id=room_id, card_uid=card_uid, event_type="CHECK_IN", status=log_status, recorded_at=time_str)
        print(f"ATTENDANCE OK: {student_name} ({student_code}) | {log_status} ({rec_status}) | LogID: {log_id}")

        gui_phan_hoi_diem_danh(room_id, {
            "status": "SUCCESS", "attendance_status": log_status,
            "student_name": student_name, "student_code": student_code, "message": msg, "beeps": beeps
        })

    else:
        print(f"ATTENDANCE FREE: Phòng {room_id} không có ca học | {student_name} ({student_code})")
        luu_attendance_log(room_id=room_id, card_uid=card_uid, event_type="CHECK_IN", status="DUNG_GIO", recorded_at=time_str)
        gui_phan_hoi_diem_danh(room_id, {
            "status": "FREE_ACCESS", "attendance_status": "DUNG_GIO",
            "student_name": student_name, "student_code": student_code, "message": "Quẹt ngoài giờ", "beeps": 1
        })

    print("=====================================\n")


def xu_ly_alert(thong_tin, data):
    print(f"ALERT | {thong_tin['room_id']} | {data}")


che_do_phong = {}


def lay_che_do_hien_tai(room_id):
    if room_id in che_do_phong:
        return che_do_phong[room_id]
    mode = lay_che_do_phong(room_id)
    che_do_phong[room_id] = mode
    return mode


def xu_ly_mode(thong_tin, data):
    room_id = thong_tin["room_id"]
    hanh_dong = thong_tin.get("hanh_dong")

    mode = data.get("mode") or data.get("state")
    if not mode:
        print(f"MODE ERROR: Thieu mode trong payload {data}")
        return

    mode = str(mode).upper()
    if mode not in ["MANUAL", "AUTO"]:
        print(f"MODE INVALID: {mode}")
        return

    che_do_phong[room_id] = mode
    cap_nhat_che_do_phong(room_id, mode)
    print(f"MODE UPDATE | Room: {room_id} | Mode: {mode} | Action: {hanh_dong}")


client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="raspberry-pi-backend")
client.on_connect = khi_ket_noi
client.on_disconnect = khi_ngat_ket_noi
client.on_message = khi_nhan_message


def ket_noi_mqtt():
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, 60)
        print("MQTT CONNECT OK")
        return True
    except Exception as e:
        print(f"MQTT CONNECT ERROR: {e}")
        return False


def gui_lenh_thiet_bi(room_id, device_name, command):
    command = str(command).upper()
    if command not in ["ON", "OFF"]:
        return False, "Command chi chap nhan ON hoac OFF"

    topic = f"classroom/{room_id}/device/{device_name}/set"
    payload_json = json.dumps({"command": command})

    try:
        result = client.publish(topic, payload_json, qos=1)
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            print(f"MQTT PUBLISH ERROR: {result.rc}")
            return False, "Khong the publish MQTT"

        print(f"\n========== MQTT TX ==========\nTopic: {topic}\nPayload: {payload_json}\n=============================")
        return True, "Command da gui"
    except Exception as e:
        print(f"MQTT PUBLISH ERROR: {e}")
        return False, "MQTT publish error"


def gui_lenh_che_do(room_id, mode):
    mode = str(mode).upper()
    if mode not in ["MANUAL", "AUTO"]:
        return False, "Chế độ không hợp lệ (chỉ chấp nhận MANUAL hoặc AUTO)"

    topic = f"classroom/{room_id}/mode/set"
    payload_json = json.dumps({"mode": mode})

    try:
        result = client.publish(topic, payload_json, qos=1, retain=True)

        for dev_mode in ["light1_mode", "light2_mode", "fan_mode"]:
            client.publish(f"classroom/{room_id}/device/{dev_mode}/set", json.dumps({"command": mode}), qos=1)

        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            print(f"MQTT PUBLISH MODE ERROR: {result.rc}")
            return False, "Không thể gửi lệnh MQTT mode"

        che_do_phong[room_id] = mode
        cap_nhat_che_do_phong(room_id, mode)

        print(f"\n========== MQTT MODE TX ==========\nTopic: {topic}\nPayload: {payload_json}\n==================================")
        return True, f"Đã chuyển sang chế độ {mode}"
    except Exception as e:
        print(f"MQTT PUBLISH ERROR: {e}")
        return False, f"Lỗi MQTT: {e}"


if __name__ == "__main__":
    print("\n========================================")
    print("     SMART CLASSROOM MQTT BACKEND")
    print("========================================")

    if not ket_noi_mqtt():
        raise SystemExit(1)

    try:
        print("MQTT LOOP START")
        client.loop_forever()
    except KeyboardInterrupt:
        print("\nMQTT STOP")
    finally:
        client.disconnect()