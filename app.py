from flask import Flask, jsonify, request, render_template

from database import (
    lay_danh_sach_phong, lay_phong,
    lay_sensor_hien_tai, lay_sensor, lay_sensor_history,
    lay_device_hien_tai, lay_device,
    lay_danh_sach_diem_danh
)
from mqtt_client import (
    client, ket_noi_mqtt, gui_lenh_thiet_bi,
    lay_che_do_hien_tai, gui_lenh_che_do, lay_trang_thai_phong
)
import threading

app = Flask(__name__)


def mqtt_loop():
    print("MQTT LOOP START")
    try:
        client.loop_forever()
    except Exception as e:
        print(f"MQTT LOOP ERROR: {e}")


@app.route("/", methods=["GET"])
def dashboard():
    return render_template("dashboard.html")


@app.route("/api/test", methods=["GET"])
def api_test():
    return jsonify({"success": True, "message": "Smart Classroom API OK"}), 200


@app.route("/api/rooms", methods=["GET"])
def api_rooms():
    rooms = lay_danh_sach_phong()
    if rooms is None:
        return jsonify({"success": False, "message": "Khong the ket noi hoac truy van MariaDB"}), 500
    for r in rooms:
        status = lay_trang_thai_phong(r["room_id"])
        r["status"] = status
        r["is_online"] = (status == "ONLINE")
    return jsonify({"success": True, "data": rooms}), 200


@app.route("/api/rooms/<room_id>", methods=["GET"])
def api_room(room_id):
    room = lay_phong(room_id)
    if room is None:
        return jsonify({"success": False, "message": "Khong tim thay phong", "room_id": room_id}), 404
    status = lay_trang_thai_phong(room_id)
    room["status"] = status
    room["is_online"] = (status == "ONLINE")
    return jsonify({"success": True, "data": room}), 200


@app.route("/api/rooms/<room_id>/status", methods=["GET"])
def api_room_status(room_id):
    status = lay_trang_thai_phong(room_id)
    return jsonify({
        "success": True,
        "room_id": room_id,
        "status": status,
        "is_online": (status == "ONLINE")
    }), 200


@app.route("/api/rooms/<room_id>/sensors", methods=["GET"])
def api_room_sensors(room_id):
    sensors = lay_sensor_hien_tai(room_id)
    if sensors is None:
        return jsonify({"success": False, "message": "Khong the truy van MariaDB", "room_id": room_id}), 500
    return jsonify({"success": True, "room_id": room_id, "data": sensors}), 200


@app.route("/api/rooms/<room_id>/sensors/<sensor_name>", methods=["GET"])
def api_sensor(room_id, sensor_name):
    sensor = lay_sensor(room_id, sensor_name)
    if sensor is None:
        return jsonify({
            "success": False, "message": "Khong tim thay sensor",
            "room_id": room_id, "sensor_name": sensor_name
        }), 404
    return jsonify({"success": True, "room_id": room_id, "data": sensor}), 200


@app.route("/api/rooms/<room_id>/sensors/<sensor_name>/history", methods=["GET"])
def api_sensor_history(room_id, sensor_name):
    limit = request.args.get("limit", default=100, type=int)
    if limit < 1:
        return jsonify({"success": False, "message": "limit phai lon hon 0"}), 400
    if limit > 1000:
        limit = 1000

    sensor = lay_sensor(room_id, sensor_name)
    if sensor is None:
        return jsonify({
            "success": False, "message": "Khong tim thay sensor",
            "room_id": room_id, "sensor_name": sensor_name
        }), 404

    history = lay_sensor_history(room_id, sensor_name, limit)
    if history is None:
        return jsonify({
            "success": False, "message": "Khong the truy van MariaDB",
            "room_id": room_id, "sensor_name": sensor_name
        }), 500

    return jsonify({
        "success": True, "room_id": room_id,
        "sensor_name": sensor_name, "limit": limit, "data": history
    }), 200


@app.route("/api/rooms/<room_id>/devices", methods=["GET"])
def api_room_devices(room_id):
    devices = lay_device_hien_tai(room_id)
    if devices is None:
        return jsonify({"success": False, "message": "Khong the truy van MariaDB", "room_id": room_id}), 500
    return jsonify({"success": True, "room_id": room_id, "data": devices}), 200


@app.route("/api/rooms/<room_id>/devices/<device_name>", methods=["GET"])
def api_device(room_id, device_name):
    device = lay_device(room_id, device_name)
    if device is None:
        return jsonify({
            "success": False, "message": "Khong tim thay device",
            "room_id": room_id, "device_name": device_name
        }), 404
    return jsonify({"success": True, "room_id": room_id, "data": device}), 200


@app.route("/api/rooms/<room_id>/devices/<device_name>/command", methods=["POST"])
def api_device_command(room_id, device_name):
    if not request.is_json:
        return jsonify({"success": False, "message": "Request phai co Content-Type: application/json"}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"success": False, "message": "JSON khong hop le"}), 400

    command = data.get("command")
    if command is None:
        return jsonify({"success": False, "message": "Thieu truong command"}), 400

    command = str(command).upper()
    if command not in ["ON", "OFF"]:
        return jsonify({"success": False, "message": "Command chi chap nhan ON hoac OFF", "command": command}), 400

    if lay_trang_thai_phong(room_id) != "ONLINE":
        return jsonify({
            "success": False,
            "message": f"Phòng {room_id} hiện đang Offline, không thể điều khiển thiết bị!",
            "room_id": room_id,
            "status": "OFFLINE"
        }), 403

    device = lay_device(room_id, device_name)
    if device is None:
        return jsonify({
            "success": False, "message": "Device khong ton tai",
            "room_id": room_id, "device_name": device_name
        }), 404

    success, message = gui_lenh_thiet_bi(room_id, device_name, command)
    if not success:
        return jsonify({
            "success": False, "message": message,
            "room_id": room_id, "device_name": device_name, "command": command
        }), 500

    return jsonify({
        "success": True, "message": "Command da gui",
        "room_id": room_id, "device_name": device_name, "command": command
    }), 202


@app.route("/api/rooms/<room_id>/mode", methods=["GET"])
def api_get_room_mode(room_id):
    room = lay_phong(room_id)
    if room is None:
        return jsonify({"success": False, "message": "Không tìm thấy phòng", "room_id": room_id}), 404
    mode = lay_che_do_hien_tai(room_id)
    return jsonify({"success": True, "room_id": room_id, "mode": mode}), 200


@app.route("/api/rooms/<room_id>/mode", methods=["POST"])
def api_set_room_mode(room_id):
    if not request.is_json:
        return jsonify({"success": False, "message": "Request phải có Content-Type: application/json"}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"success": False, "message": "JSON không hợp lệ"}), 400

    mode = data.get("mode")
    if not mode:
        return jsonify({"success": False, "message": "Thiếu trường mode"}), 400

    mode = str(mode).upper()
    if mode not in ["MANUAL", "AUTO"]:
        return jsonify({"success": False, "message": "Mode chỉ chấp nhận MANUAL hoặc AUTO", "mode": mode}), 400

    room = lay_phong(room_id)
    if room is None:
        return jsonify({"success": False, "message": "Không tìm thấy phòng", "room_id": room_id}), 404

    if lay_trang_thai_phong(room_id) != "ONLINE":
        return jsonify({
            "success": False,
            "message": f"Phòng {room_id} hiện đang Offline, không thể thay đổi chế độ!",
            "room_id": room_id,
            "status": "OFFLINE"
        }), 403

    success, message = gui_lenh_che_do(room_id, mode)
    if not success:
        return jsonify({"success": False, "message": message, "room_id": room_id, "mode": mode}), 500

    return jsonify({"success": True, "message": message, "room_id": room_id, "mode": mode}), 200


@app.route("/api/rfid-log", methods=["GET"])
def api_rfid_log():
    """Nhật ký quét thẻ RFID thô (raw scan log)."""
    room_id = request.args.get("room_id")
    date_filter = request.args.get("date")
    limit = request.args.get("limit", default=100, type=int)
    limit = min(max(1, limit), 500)

    logs = lay_danh_sach_diem_danh(room_id=room_id, limit=limit, ngay=date_filter)
    if logs is None:
        return jsonify({"success": False, "message": "Khong the truy van RFID log"}), 500

    return jsonify({"success": True, "data": logs}), 200


@app.errorhandler(404)
def not_found(error):
    return jsonify({"success": False, "message": "API khong ton tai"}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({"success": False, "message": "Loi server"}), 500


if __name__ == "__main__":
    print("\n========================================")
    print("       SMART CLASSROOM SERVER")
    print("========================================")

    mqtt_ok = ket_noi_mqtt()
    if not mqtt_ok:
        print("WARNING: MQTT chua ket noi")
    else:
        mqtt_thread = threading.Thread(target=mqtt_loop, daemon=True)
        mqtt_thread.start()

    print("\nFlask starting...")
    print("URL: http://0.0.0.0:5000\n")
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)