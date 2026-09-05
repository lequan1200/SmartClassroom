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


# ============================================================
# KHOI TAO FLASK
# ============================================================

app = Flask(__name__)


# ============================================================
# MQTT BACKGROUND LOOP
# ============================================================

def mqtt_loop():

    print("MQTT LOOP START")

    try:

        client.loop_forever()

    except Exception as e:

        print(f"MQTT LOOP ERROR: {e}")


# ============================================================
# WEB DASHBOARD
# ============================================================

@app.route("/", methods=["GET"])
def dashboard():

    return render_template("dashboard.html")


# ============================================================
# API KIEM TRA SERVER
# ============================================================

@app.route("/api/test", methods=["GET"])
def api_test():

    return jsonify({
        "success": True,
        "message": "Smart Classroom API OK"
    }), 200


# ============================================================
# API LAY DANH SACH PHONG
# ============================================================

@app.route("/api/rooms", methods=["GET"])
def api_rooms():

    rooms = lay_danh_sach_phong()

    if rooms is None:

        return jsonify({
            "success": False,
            "message": "Khong the ket noi hoac truy van MariaDB"
        }), 500

    return jsonify({
        "success": True,
        "data": rooms
    }), 200


# ============================================================
# API LAY THONG TIN MOT PHONG
# ============================================================

@app.route("/api/rooms/<room_id>", methods=["GET"])
def api_room(room_id):

    room = lay_phong(room_id)

    if room is None:

        return jsonify({
            "success": False,
            "message": "Khong tim thay phong",
            "room_id": room_id
        }), 404

    return jsonify({
        "success": True,
        "data": room
    }), 200


# ============================================================
# API LAY SENSOR HIEN TAI CUA PHONG
# ============================================================

@app.route(
    "/api/rooms/<room_id>/sensors",
    methods=["GET"]
)
def api_room_sensors(room_id):

    sensors = lay_sensor_hien_tai(room_id)

    if sensors is None:

        return jsonify({
            "success": False,
            "message": "Khong the truy van MariaDB",
            "room_id": room_id
        }), 500

    return jsonify({
        "success": True,
        "room_id": room_id,
        "data": sensors
    }), 200


# ============================================================
# API LAY MOT SENSOR
# ============================================================

@app.route(
    "/api/rooms/<room_id>/sensors/<sensor_name>",
    methods=["GET"]
)
def api_sensor(room_id, sensor_name):

    sensor = lay_sensor(
        room_id,
        sensor_name
    )

    if sensor is None:

        return jsonify({
            "success": False,
            "message": "Khong tim thay sensor",
            "room_id": room_id,
            "sensor_name": sensor_name
        }), 404

    return jsonify({
        "success": True,
        "room_id": room_id,
        "data": sensor
    }), 200


# ============================================================
# API LAY LICH SU SENSOR
# ============================================================

@app.route(
    "/api/rooms/<room_id>/sensors/<sensor_name>/history",
    methods=["GET"]
)
def api_sensor_history(room_id, sensor_name):

    # --------------------------------------------------------
    # Lay limit tu query string
    #
    # Vi du:
    # /api/rooms/room01/sensors/temperature/history?limit=100
    # --------------------------------------------------------

    limit = request.args.get(
        "limit",
        default=100,
        type=int
    )

    # --------------------------------------------------------
    # Kiem tra limit
    # --------------------------------------------------------

    if limit < 1:

        return jsonify({
            "success": False,
            "message": "limit phai lon hon 0"
        }), 400

    # --------------------------------------------------------
    # Gioi han toi da 1000 ban ghi
    # --------------------------------------------------------

    if limit > 1000:
        limit = 1000

    # --------------------------------------------------------
    # Kiem tra sensor ton tai
    # --------------------------------------------------------

    sensor = lay_sensor(
        room_id,
        sensor_name
    )

    if sensor is None:

        return jsonify({
            "success": False,
            "message": "Khong tim thay sensor",
            "room_id": room_id,
            "sensor_name": sensor_name
        }), 404

    # --------------------------------------------------------
    # Lay lich su sensor
    # --------------------------------------------------------

    history = lay_sensor_history(
        room_id,
        sensor_name,
        limit
    )

    if history is None:

        return jsonify({
            "success": False,
            "message": "Khong the truy van MariaDB",
            "room_id": room_id,
            "sensor_name": sensor_name
        }), 500

    # --------------------------------------------------------
    # Tra ket qua
    # --------------------------------------------------------

    return jsonify({
        "success": True,
        "room_id": room_id,
        "sensor_name": sensor_name,
        "limit": limit,
        "data": history
    }), 200


# ============================================================
# API LAY DEVICE HIEN TAI CUA PHONG
# ============================================================

@app.route(
    "/api/rooms/<room_id>/devices",
    methods=["GET"]
)
def api_room_devices(room_id):

    devices = lay_device_hien_tai(room_id)

    if devices is None:

        return jsonify({
            "success": False,
            "message": "Khong the truy van MariaDB",
            "room_id": room_id
        }), 500

    return jsonify({
        "success": True,
        "room_id": room_id,
        "data": devices
    }), 200


# ============================================================
# API LAY MOT DEVICE
# ============================================================

@app.route(
    "/api/rooms/<room_id>/devices/<device_name>",
    methods=["GET"]
)
def api_device(room_id, device_name):

    device = lay_device(
        room_id,
        device_name
    )

    if device is None:

        return jsonify({
            "success": False,
            "message": "Khong tim thay device",
            "room_id": room_id,
            "device_name": device_name
        }), 404

    return jsonify({
        "success": True,
        "room_id": room_id,
        "data": device
    }), 200


# ============================================================
# API GUI COMMAND CHO DEVICE
# ============================================================

@app.route(
    "/api/rooms/<room_id>/devices/<device_name>/command",
    methods=["POST"]
)
def api_device_command(room_id, device_name):

    # --------------------------------------------------------
    # Kiem tra Content-Type
    # --------------------------------------------------------

    if not request.is_json:

        return jsonify({
            "success": False,
            "message": "Request phai co Content-Type: application/json"
        }), 400

    # --------------------------------------------------------
    # Lay JSON
    # --------------------------------------------------------

    data = request.get_json(
        silent=True
    )

    if not isinstance(data, dict):

        return jsonify({
            "success": False,
            "message": "JSON khong hop le"
        }), 400

    # --------------------------------------------------------
    # Lay command
    # --------------------------------------------------------

    command = data.get("command")

    if command is None:

        return jsonify({
            "success": False,
            "message": "Thieu truong command"
        }), 400

    command = str(command).upper()

    # --------------------------------------------------------
    # Kiem tra command
    # --------------------------------------------------------

    if command not in [
        "ON",
        "OFF"
    ]:

        return jsonify({
            "success": False,
            "message": "Command chi chap nhan ON hoac OFF",
            "command": command
        }), 400

    # --------------------------------------------------------
    # Kiem tra device ton tai
    # --------------------------------------------------------

    device = lay_device(
        room_id,
        device_name
    )

    if device is None:

        return jsonify({
            "success": False,
            "message": "Device khong ton tai",
            "room_id": room_id,
            "device_name": device_name
        }), 404

    # --------------------------------------------------------
    # Gui command qua MQTT
    # --------------------------------------------------------

    success, message = gui_lenh_thiet_bi(
        room_id,
        device_name,
        command
    )

    if not success:

        return jsonify({
            "success": False,
            "message": message,
            "room_id": room_id,
            "device_name": device_name,
            "command": command
        }), 500

    # --------------------------------------------------------
    # KHONG cap nhat device_current tai day
    #
    # Day chi la COMMAND.
    #
    # ESP32 phai thuc hien command va gui status:
    #
    # classroom/room01/device/light/status
    #
    # MQTT client moi cap nhat device_current.
    # --------------------------------------------------------

    return jsonify({
        "success": True,
        "message": "Command da gui",
        "room_id": room_id,
        "device_name": device_name,
        "command": command
    }), 202


# ============================================================
# ERROR 404
# ============================================================

@app.errorhandler(404)
def not_found(error):

    return jsonify({
        "success": False,
        "message": "API khong ton tai"
    }), 404


# ============================================================
# ERROR 500
# ============================================================

@app.errorhandler(500)
def internal_error(error):

    return jsonify({
        "success": False,
        "message": "Loi server"
    }), 500


# ============================================================
# CHAY SERVER
# ============================================================

if __name__ == "__main__":

    print()
    print("========================================")
    print("       SMART CLASSROOM SERVER")
    print("========================================")

    # --------------------------------------------------------
    # KET NOI MQTT
    # --------------------------------------------------------

    mqtt_ok = ket_noi_mqtt()

    if not mqtt_ok:

        print(
            "WARNING: MQTT chua ket noi"
        )

    else:

        # ----------------------------------------------------
        # Chay MQTT loop background
        # ----------------------------------------------------

        mqtt_thread = threading.Thread(
            target=mqtt_loop,
            daemon=True
        )

        mqtt_thread.start()

    # --------------------------------------------------------
    # CHAY FLASK
    # --------------------------------------------------------

    print()
    print("Flask starting...")
    print("URL: http://0.0.0.0:5000")
    print()

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True,
        use_reloader=False
    )