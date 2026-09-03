from flask import Flask, jsonify

from database import (
    lay_danh_sach_phong,
    lay_sensor_hien_tai,
    lay_device_hien_tai
)


# ============================================================
# KHOI TAO FLASK
# ============================================================

app = Flask(__name__)


# ============================================================
# API KIEM TRA SERVER
# ============================================================

@app.route("/api/test", methods=["GET"])
def api_test():

    return jsonify({
        "success": True,
        "message": "Smart Classroom API OK"
    })


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
    })


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
            "message": "Khong the truy van MariaDB"
        }), 500

    return jsonify({
        "success": True,
        "room_id": room_id,
        "data": sensors
    })
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
            "message": "Khong the truy van MariaDB"
        }), 500

    return jsonify({
        "success": True,
        "room_id": room_id,
        "data": devices
    })

# ============================================================
# CHAY SERVER
# ============================================================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )