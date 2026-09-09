import sys
import json
import time
from datetime import datetime

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import paho.mqtt.client as mqtt

from database import (
    ket_noi,
    tim_sensor_id, luu_sensor_data, cap_nhat_sensor_current,
    tim_device_id, cap_nhat_device_current, luu_device_log,
    luu_attendance_log, tim_hoc_vien_theo_card,
    lay_che_do_phong, cap_nhat_che_do_phong,
    lay_hoac_tao_buoi_hoc_hien_tai, hoc_vien_thuoc_lop, ghi_nhan_diem_danh,
    lay_hoc_vien_theo_lop, lay_chi_tiet_lop, gan_the_hoc_vien,
    lay_hoc_vien_theo_phong
)

MQTT_BROKER = "127.0.0.1"
MQTT_PORT = 1883
MQTT_TOPIC = "classroom/#"

# Ngưỡng timeout: nếu không nhận được bản tin thực (non-retained) trong khoảng
# này thì phòng bị coi là OFFLINE. ESP32 gửi cảm biến mỗi 2 giây,
# 10 giây tương đương 5 chu kỳ bỏ lỡ - đủ để hấp thụ dao động mạng ngắn.
TIMEOUT_PHONG_ONLINE = 10  # giây

trang_thai_phong = {}          # room_id -> "ONLINE" | "OFFLINE"
thoi_gian_nhan_tin_cuoi = {}   # room_id -> float (Unix timestamp)
the_rfid_vua_quet = {}         # room_id -> {"card_uid": ..., "time_str": ..., "timestamp": ...}


def cap_nhat_the_vua_quet(room_id, card_uid, time_str=None):
    if not card_uid:
        return
    card_uid = str(card_uid).strip().upper()
    now_str = time_str or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = {
        "card_uid": card_uid,
        "room_id": room_id,
        "time_str": now_str,
        "scanned_at": now_str,
        "timestamp": time.time()
    }
    the_rfid_vua_quet[room_id] = entry
    the_rfid_vua_quet["_latest"] = entry


def lay_the_rfid_vua_quet(room_id=None):
    if room_id:
        return the_rfid_vua_quet.get(room_id)
    return the_rfid_vua_quet.get("_latest")


def _danh_dau_online(room_id):
    """Cập nhật trạng thái ONLINE và ghi nhận thời điểm nhận bản tin thực."""
    trang_thai_phong[room_id] = "ONLINE"
    thoi_gian_nhan_tin_cuoi[room_id] = time.monotonic()


def lay_trang_thai_phong(room_id):
    """Trả về 'ONLINE' nếu phòng gửi bản tin trong TIMEOUT_PHONG_ONLINE giây gần nhất,
    hoặc 'OFFLINE' nếu quá hạn / chưa từng nhận bản tin nào."""
    # Trường hợp phòng đã bị đánh dấu OFFLINE tường minh (qua LWT hoặc status topic)
    if trang_thai_phong.get(room_id) == "OFFLINE":
        return "OFFLINE"

    last_seen = thoi_gian_nhan_tin_cuoi.get(room_id)
    if last_seen is None:
        return "OFFLINE"

    if time.monotonic() - last_seen <= TIMEOUT_PHONG_ONLINE:
        return "ONLINE"

    # Quá ngưỡng - tự động chuyển sang OFFLINE và ghi log
    if trang_thai_phong.get(room_id) == "ONLINE":
        trang_thai_phong[room_id] = "OFFLINE"
        print(f"ROOM TIMEOUT: {room_id} -> OFFLINE (khong nhan ban tin trong {TIMEOUT_PHONG_ONLINE}s)")
    return "OFFLINE"


def lay_tat_ca_trang_thai_phong():
    return {rid: lay_trang_thai_phong(rid) for rid in set(trang_thai_phong) | set(thoi_gian_nhan_tin_cuoi)}


def phan_tich_topic(topic):
    parts = topic.split("/")
    if len(parts) < 3 or parts[0] != "classroom":
        return None

    room_id = parts[1]
    loai = parts[2]

    if loai == "status" and len(parts) == 3:
        return {"room_id": room_id, "loai": "status"}
    if loai == "sensor" and len(parts) == 4:
        return {"room_id": room_id, "loai": "sensor", "ten": parts[3]}
    if loai == "device" and len(parts) == 5:
        return {"room_id": room_id, "loai": "device", "ten": parts[3], "hanh_dong": parts[4]}
    if loai == "attendance" and len(parts) == 4 and parts[3] == "feedback":
        return None
    if loai == "attendance" and len(parts) == 3:
        return {"room_id": room_id, "loai": "attendance"}
    if loai == "alert" and len(parts) == 3:
        return {"room_id": room_id, "loai": "alert"}
    if loai == "mode" and len(parts) == 4:
        return {"room_id": room_id, "loai": "mode", "hanh_dong": parts[3]}
    if loai == "class":
        if len(parts) >= 4 and parts[3] in ["students", "feedback"]:
            return None
        if len(parts) == 4 and parts[3] == "request":
            return {"room_id": room_id, "loai": "class_request"}
    if loai == "rfid":
        if len(parts) == 4 and parts[3] == "scanned":
            return {"room_id": room_id, "loai": "rfid_scanned"}
        if len(parts) == 4 and parts[3] in ["mode", "feedback"]:
            return None
    if loai == "student":
        if len(parts) == 4 and parts[3] == "lookup":
            return {"room_id": room_id, "loai": "student_lookup"}
        if len(parts) >= 5 and parts[3] == "lookup":
            return None

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


def xu_ly_status(room_id, payload, is_retained=False):
    """Xử lý bản tin classroom/{room_id}/status.

    Bản tin ONLINE cập nhật last_seen, bản tin OFFLINE đánh dấu ngay.
    Bản tin retained OFFLINE từ LWT cũng được chấp nhận để xử lý đúng khi
    ESP32 mất kết nối đột ngột.
    """
    status_str = str(payload).strip().strip('"\'\'').upper()

    if status_str in ["ONLINE", "1", "TRUE"]:
        if is_retained:
            # Bản tin ONLINE cũ từ broker khi vừa khởi động server.
            # Không thể xác nhận thiết bị còn sống - bỏ qua cập nhật last_seen.
            print(f"ROOM STATUS RETAINED SKIP: {room_id} -> ONLINE (retained, bo qua)")
            return
        _danh_dau_online(room_id)
        print(f"ROOM STATUS: {room_id} -> ONLINE")
        return

    if status_str in ["OFFLINE", "0", "FALSE"]:
        # OFFLINE luôn được xử lý dù là retained (LWT) hay thời gian thực.
        trang_thai_phong[room_id] = "OFFLINE"
        # Xóa last_seen để tránh hiểu nhầm khi thiết bị kết nối lại sau
        thoi_gian_nhan_tin_cuoi.pop(room_id, None)
        print(f"ROOM STATUS: {room_id} -> OFFLINE{'(LWT retained)' if is_retained else ''}")
        return

    # Thử parse JSON
    try:
        data = json.loads(payload)
        if isinstance(data, dict):
            val = str(data.get("status") or data.get("state") or "").strip().upper()
            if val in ["ONLINE", "1", "TRUE"]:
                if not is_retained:
                    _danh_dau_online(room_id)
                    print(f"ROOM STATUS (JSON): {room_id} -> ONLINE")
                else:
                    print(f"ROOM STATUS (JSON) RETAINED SKIP: {room_id} -> ONLINE")
                return
            if val in ["OFFLINE", "0", "FALSE"]:
                trang_thai_phong[room_id] = "OFFLINE"
                thoi_gian_nhan_tin_cuoi.pop(room_id, None)
                print(f"ROOM STATUS (JSON): {room_id} -> OFFLINE")
                return
    except Exception:
        pass

    print(f"ROOM STATUS UNKNOWN: {room_id} -> {payload}")


def khi_nhan_message(client, userdata, message):
    topic = message.topic
    is_retained = bool(message.retain)

    try:
        payload = message.payload.decode("utf-8")
    except UnicodeDecodeError:
        print("PAYLOAD ERROR")
        return

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    retain_tag = " [RETAINED]" if is_retained else ""
    print(f"\n========== MQTT RX ==========\nTopic: {topic}{retain_tag}\nPayload: {payload}\nTIME: {timestamp}\n=============================")

    thong_tin = phan_tich_topic(topic)
    if thong_tin is None:
        print("TOPIC IGNORED")
        return

    room_id = thong_tin["room_id"]
    loai = thong_tin["loai"]

    if loai == "status":
        xu_ly_status(room_id, payload, is_retained=is_retained)
        return

    # Bản tin retained từ broker (device status, mode status, alert...) KHÔNG được
    # dùng để cập nhật last_seen vì không chứng minh thiết bị đang hoạt động.
    if is_retained:
        print(f"RETAINED MSG SKIP last_seen update: {topic}")
        return

    # Bản tin thời gian thực từ phòng -> xác nhận thiết bị đang ONLINE
    _danh_dau_online(room_id)

    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        print("JSON ERROR")
        return

    if not isinstance(data, dict):
        print("JSON ERROR: payload phai la object")
        return

    try:
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
        elif loai == "class_request":
            xu_ly_class_request(thong_tin, data)
        elif loai == "rfid_scanned":
            xu_ly_rfid_scanned(thong_tin, data)
        elif loai == "student_lookup":
            xu_ly_student_lookup(thong_tin, data)
    except Exception as e:
        print(f"MQTT DISPATCH ERROR [{topic}]: {e}")


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
        print(f"RFID FEEDBACK TX -> {topic}: {payload_str}")
    except Exception as e:
        print(f"RFID FEEDBACK ERROR: {e}")


def xu_ly_attendance(thong_tin, data):
    """Lưu log RFID thô, rồi điểm danh theo buổi học đang diễn ra tại phòng."""
    room_id = thong_tin["room_id"]
    card_uid = (data.get("card_uid") or data.get("uid") or data.get("card") or "").strip().upper()
    timestamp_str = data.get("timestamp") or data.get("time")

    if not card_uid:
        print(f"RFID ERROR: Missing card_uid for room {room_id}")
        return

    scan_dt = datetime.now()
    if timestamp_str:
        try:
            scan_dt = datetime.fromisoformat(str(timestamp_str).replace("Z", "+00:00"))
            if scan_dt.tzinfo:
                scan_dt = scan_dt.astimezone().replace(tzinfo=None)
        except Exception:
            try:
                scan_dt = datetime.strptime(str(timestamp_str), "%Y-%m-%d %H:%M:%S")
            except Exception:
                pass

    time_str = scan_dt.strftime("%Y-%m-%d %H:%M:%S")
    cap_nhat_the_vua_quet(room_id, card_uid, time_str)
    print(f"\n========== RFID SCAN ==========\nRoom      : {room_id}\nCard UID  : {card_uid}\nScan Time : {time_str}")

    student = tim_hoc_vien_theo_card(card_uid)
    if not student:
        print(f"RFID ALERT: Thẻ {card_uid} chưa được gán cho học viên nào!")
        luu_attendance_log(room_id=room_id, card_uid=card_uid, event_type="CHECK_IN", status="CHUA_DANG_KY", recorded_at=time_str)
        gui_phan_hoi_diem_danh(room_id, {"status": "UNKNOWN_CARD", "card_uid": card_uid, "message": "Thẻ chưa đăng ký học viên", "beeps": 3})
        print("===============================\n")
        return

    student_name = student["full_name"]
    student_code = student["student_code"]

    session = None
    explicit_session_id = data.get("session_id")
    if explicit_session_id:
        conn = ket_noi()
        if conn:
            try:
                cur = conn.cursor()
                cur.execute("""SELECT cs.id, cs.late_after_at, sub.subject_name,
                                      cs.starts_at, cs.ends_at, cs.status,
                                      cs.class_id, c.class_code, c.class_name
                               FROM class_sessions cs
                               JOIN subjects sub ON sub.id=cs.subject_id
                               LEFT JOIN classes c ON c.id=cs.class_id
                               WHERE cs.id=?""", (explicit_session_id,))
                s_row = cur.fetchone()
                cur.close(); conn.close()
                if s_row:
                    session = {
                        "id": s_row[0], "session_id": s_row[0], "late_after_at": s_row[1],
                        "subject_name": s_row[2], "starts_at": s_row[3], "ends_at": s_row[4],
                        "status": s_row[5], "class_id": s_row[6], "class_code": s_row[7] or "",
                        "class_name": s_row[8] or ""
                    }
            except Exception as ex:
                if conn: conn.close()

    if not session:
        session = lay_hoac_tao_buoi_hoc_hien_tai(room_id, scan_dt)

    if not session:
        luu_attendance_log(room_id=room_id, card_uid=card_uid, event_type="CHECK_IN", status="KHONG_CO_BUOI_HOC", recorded_at=time_str)
        gui_phan_hoi_diem_danh(room_id, {
            "status": "NO_ACTIVE_SESSION", "student_name": student_name,
            "student_code": student_code, "message": "Không có buổi học đang điểm danh", "beeps": 2
        })
        return

    if session.get("class_id") and not hoc_vien_thuoc_lop(student["id"], session["class_id"]):
        luu_attendance_log(room_id=room_id, card_uid=card_uid, event_type="CHECK_IN", status="SAI_LOP", recorded_at=time_str)
        gui_phan_hoi_diem_danh(room_id, {
            "status": "NOT_IN_CLASS", "student_name": student_name,
            "student_code": student_code, "message": f"Không thuộc lớp {session.get('class_code', '')}", "beeps": 2
        })
        return

    late_threshold = session.get("late_after_at")
    if isinstance(late_threshold, str):
        try:
            late_threshold = datetime.fromisoformat(late_threshold)
        except Exception:
            pass
    attendance_status = "LATE" if (isinstance(late_threshold, datetime) and scan_dt > late_threshold) else "PRESENT"
    raw_log_id = luu_attendance_log(room_id=room_id, card_uid=card_uid,
                                    event_type="CHECK_IN", status="DI_MUON" if attendance_status == "LATE" else "DUNG_GIO",
                                    recorded_at=time_str)
    created = ghi_nhan_diem_danh(session["id"], student["id"], scan_dt, attendance_status, raw_log_id)
    if created is False:
        gui_phan_hoi_diem_danh(room_id, {
            "status": "ALREADY_CHECKED_IN", "student_name": student_name,
            "student_code": student_code, "message": "Đã điểm danh cho buổi này", "beeps": 1
        })
        return
    if created is None:
        gui_phan_hoi_diem_danh(room_id, {"status": "ERROR", "message": "Không thể lưu điểm danh", "beeps": 3})
        return

    gui_phan_hoi_diem_danh(room_id, {
        "status": "SUCCESS", "attendance_status": attendance_status,
        "student_name": student_name, "student_code": student_code,
        "message": "Đã ghi nhận điểm danh", "beeps": 1
    })

    print(f"RFID OK: {student_name} ({student_code}) | Phòng: {room_id}")
    print("===============================\n")


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


# ===== QUẢN LÝ HỌC SINH VÀ PHÒNG HỌC QUA MQTT =====

def dong_bo_hoc_sinh_phong_mqtt(room_id):
    """Gửi bản tin MQTT đồng bộ danh sách học sinh của riêng phòng học này tới ESP32.
    Topic: classroom/{room_id}/class/students
    """
    students = lay_hoc_vien_theo_phong(room_id)
    if students is None:
        return False, "Không thể đọc dữ liệu học sinh của phòng"

    payload = {
        "event": "SYNC_STUDENTS",
        "room_id": room_id,
        "total_students": len(students),
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "students": [
            {
                "id": s["id"],
                "student_code": s["student_code"],
                "full_name": s["full_name"],
                "card_uid": s["card_uid"] or ""
            }
            for s in students
        ]
    }
    topic = f"classroom/{room_id}/class/students"
    try:
        msg = json.dumps(payload, ensure_ascii=False)
        client.publish(topic, msg, qos=1)
        print(f"MQTT SYNC ROOM -> {topic}: {len(students)} students")
        return True, f"Đã đồng bộ {len(students)} học sinh tới phòng {room_id}"
    except Exception as e:
        print(f"MQTT SYNC ERROR: {e}")
        return False, str(e)


def dong_bo_hoc_sinh_lop_mqtt(room_id, class_id):
    """Gửi bản tin MQTT đồng bộ danh sách học sinh tới phòng học (tương thích)."""
    # Ưu tiên đồng bộ học sinh của phòng
    ok, msg = dong_bo_hoc_sinh_phong_mqtt(room_id)
    if ok:
        return True, msg

    cls_info = lay_chi_tiet_lop(class_id)
    students = lay_hoc_vien_theo_lop(class_id)
    if students is None:
        return False, "Không thể đọc dữ liệu học sinh"

    payload = {
        "event": "SYNC_STUDENTS",
        "room_id": room_id,
        "class_id": class_id,
        "class_code": cls_info.get("class_code", "") if cls_info else "",
        "class_name": cls_info.get("class_name", "") if cls_info else "",
        "total_students": len(students),
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "students": [
            {
                "id": s["id"],
                "student_code": s["student_code"],
                "full_name": s["full_name"],
                "card_uid": s["card_uid"] or ""
            }
            for s in students
        ]
    }
    topic = f"classroom/{room_id}/class/students"
    try:
        msg = json.dumps(payload, ensure_ascii=False)
        client.publish(topic, msg, qos=1)
        print(f"MQTT SYNC CLASS -> {topic}: {len(students)} students")
        return True, f"Đã đồng bộ {len(students)} học sinh tới {room_id}"
    except Exception as e:
        print(f"MQTT SYNC ERROR: {e}")
        return False, str(e)


def xu_ly_class_request(thong_tin, data):
    """Xử lý yêu cầu danh sách học sinh từ ESP32: classroom/{room_id}/class/request"""
    room_id = thong_tin["room_id"]
    ok, _ = dong_bo_hoc_sinh_phong_mqtt(room_id)
    if not ok:
        class_id = data.get("class_id")
        if not class_id:
            session = lay_hoac_tao_buoi_hoc_hien_tai(room_id)
            if session and session.get("class_id"):
                class_id = session["class_id"]

        if class_id:
            dong_bo_hoc_sinh_lop_mqtt(room_id, class_id)
        else:
            topic = f"classroom/{room_id}/class/students"
            client.publish(topic, json.dumps({
                "event": "NO_STUDENTS",
                "room_id": room_id,
                "message": "Chưa có học sinh nào trong phòng"
            }, ensure_ascii=False), qos=0)


che_do_gan_the_dang_cho = {}  # room_id -> student_id


def dat_che_do_gan_the(room_id, student_id):
    """Bật/tắt chế độ chờ quẹt thẻ RFID để gán cho học sinh."""
    if student_id:
        che_do_gan_the_dang_cho[room_id] = student_id
        topic = f"classroom/{room_id}/rfid/mode"
        client.publish(topic, json.dumps({"mode": "LEARN", "student_id": student_id}), qos=1)
        print(f"RFID LEARN MODE ACTIVATED -> Room: {room_id} for Student: {student_id}")
    else:
        che_do_gan_the_dang_cho.pop(room_id, None)
        topic = f"classroom/{room_id}/rfid/mode"
        client.publish(topic, json.dumps({"mode": "NORMAL"}), qos=1)
        print(f"RFID LEARN MODE CANCELLED -> Room: {room_id}")


def xu_ly_rfid_scanned(thong_tin, data):
    """Xử lý quẹt thẻ trong chế độ gán thẻ: classroom/{room_id}/rfid/scanned"""
    room_id = thong_tin["room_id"]
    card_uid = (data.get("card_uid") or data.get("uid") or "").strip().upper()
    if not card_uid:
        return
    cap_nhat_the_vua_quet(room_id, card_uid)

    student_id = che_do_gan_the_dang_cho.get(room_id)
    if student_id:
        res = gan_the_hoc_vien(student_id, card_uid)
        che_do_gan_the_dang_cho.pop(room_id, None)
        topic_feedback = f"classroom/{room_id}/rfid/feedback"
        if res.get("success"):
            client.publish(topic_feedback, json.dumps({
                "status": "SUCCESS", "card_uid": card_uid, "student_id": student_id,
                "message": f"Đã gán mã thẻ {card_uid} thành công!"
            }, ensure_ascii=False), qos=1)
        else:
            client.publish(topic_feedback, json.dumps({
                "status": "ERROR", "card_uid": card_uid,
                "message": res.get("error", "Lỗi gán thẻ")
            }, ensure_ascii=False), qos=1)


def xu_ly_student_lookup(thong_tin, data):
    """Xử lý tra cứu học sinh theo thẻ: classroom/{room_id}/student/lookup"""
    room_id = thong_tin["room_id"]
    card_uid = (data.get("card_uid") or data.get("uid") or "").strip().upper()
    if not card_uid:
        return

    student = tim_hoc_vien_theo_card(card_uid)
    topic = f"classroom/{room_id}/student/lookup/feedback"
    if student:
        client.publish(topic, json.dumps({
            "found": True,
            "card_uid": card_uid,
            "student": {
                "id": student["id"],
                "student_code": student["student_code"],
                "full_name": student["full_name"],
                "class_id": student.get("class_id"),
                "class_code": student.get("class_code", ""),
                "class_name": student.get("class_name", "")
            }
        }, ensure_ascii=False), qos=0)
    else:
        client.publish(topic, json.dumps({
            "found": False,
            "card_uid": card_uid,
            "message": "Không tìm thấy học sinh với mã thẻ này"
        }, ensure_ascii=False), qos=0)


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
