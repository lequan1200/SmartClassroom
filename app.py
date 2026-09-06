from flask import Flask, jsonify, request, render_template
import threading

from database import (
    lay_danh_sach_phong,
    lay_phong,
    lay_sensor_hien_tai,
    lay_sensor,
    lay_sensor_history,
    lay_device_hien_tai,
    lay_device
)

from mqtt_client import (
    client,
    ket_noi_mqtt,
    gui_lenh_thiet_bi
)

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
    return jsonify({"success": True, "data": rooms}), 200


@app.route("/api/rooms/<room_id>", methods=["GET"])
def api_room(room_id):
    room = lay_phong(room_id)
    if room is None:
        return jsonify({"success": False, "message": "Khong tim thay phong", "room_id": room_id}), 404
    return jsonify({"success": True, "data": room}), 200


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
            "success": False,
            "message": "Khong tim thay sensor",
            "room_id": room_id,
            "sensor_name": sensor_name
        }), 404
    return jsonify({"success": True, "room_id": room_id, "data": sensor}), 200


@app.route("/api/rooms/<room_id>/sensors/<sensor_name>/history", methods=["GET"])
def api_sensor_history(room_id, sensor_name):
    # limit tu query string, vd: ?limit=100
    limit = request.args.get("limit", default=100, type=int)

    if limit < 1:
        return jsonify({"success": False, "message": "limit phai lon hon 0"}), 400

    if limit > 1000:
        limit = 1000

    sensor = lay_sensor(room_id, sensor_name)
    if sensor is None:
        return jsonify({
            "success": False,
            "message": "Khong tim thay sensor",
            "room_id": room_id,
            "sensor_name": sensor_name
        }), 404

    history = lay_sensor_history(room_id, sensor_name, limit)
    if history is None:
        return jsonify({
            "success": False,
            "message": "Khong the truy van MariaDB",
            "room_id": room_id,
            "sensor_name": sensor_name
        }), 500

    return jsonify({
        "success": True,
        "room_id": room_id,
        "sensor_name": sensor_name,
        "limit": limit,
        "data": history
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
            "success": False,
            "message": "Khong tim thay device",
            "room_id": room_id,
            "device_name": device_name
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

    device = lay_device(room_id, device_name)
    if device is None:
        return jsonify({
            "success": False,
            "message": "Device khong ton tai",
            "room_id": room_id,
            "device_name": device_name
        }), 404

    success, message = gui_lenh_thiet_bi(room_id, device_name, command)
    if not success:
        return jsonify({
            "success": False,
            "message": message,
            "room_id": room_id,
            "device_name": device_name,
            "command": command
        }), 500

    # Day chi la COMMAND; ESP32 phai gui status qua
    # classroom/room01/device/light/status de MQTT client cap nhat device_current.
    return jsonify({
        "success": True,
        "message": "Command da gui",
        "room_id": room_id,
        "device_name": device_name,
        "command": command
    }), 202


@app.errorhandler(404)
def not_found(error):
    return jsonify({"success": False, "message": "API khong ton tai"}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({"success": False, "message": "Loi server"}), 500


if __name__ == "__main__":
    print()
    print("========================================")
    print("       SMART CLASSROOM SERVER")
    print("========================================")

    mqtt_ok = ket_noi_mqtt()
    if not mqtt_ok:
        print("WARNING: MQTT chua ket noi")
    else:
        mqtt_thread = threading.Thread(target=mqtt_loop, daemon=True)
        mqtt_thread.start()

    print()
    print("Flask starting...")
    print("URL: http://0.0.0.0:5000")
    print()

    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)