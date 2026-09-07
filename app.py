from flask import Flask, jsonify, request, render_template, Response
import threading
import io
import csv

from database import (
    lay_danh_sach_phong,
    lay_phong,
    lay_che_do_phong,
    lay_sensor_hien_tai,
    lay_sensor,
    lay_sensor_history,
    lay_device_hien_tai,
    lay_device,
    lay_danh_sach_hoc_vien,
    them_hoc_vien,
    sua_hoc_vien,
    xoa_hoc_vien,
    gan_the_hoc_vien,
    tim_hoc_vien_theo_card,
    lay_danh_sach_diem_danh,
    lay_thong_ke_diem_danh,
    lay_danh_sach_sessions,
    lay_bang_diem_danh_buoi_hoc,
    cap_nhat_diem_danh_thu_cong,
    dong_buoi_diem_danh,
    lay_danh_sach_lop_hoc_phan,
    lay_danh_sach_mon_hoc,
    lay_thoi_khoa_bieu,
    tao_session_moi,
    ghi_nhan_diem_danh_sinh_vien,
    tao_lich_hoc,
    sua_lich_hoc,
    xoa_lich_hoc
)

from mqtt_client import (
    client,
    ket_noi_mqtt,
    gui_lenh_thiet_bi,
    lay_che_do_hien_tai,
    gui_lenh_che_do
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


# ============================================================
# API CHẾ ĐỘ ĐIỀU KHIỂN (MANUAL / AUTO)
# ============================================================

@app.route("/api/rooms/<room_id>/mode", methods=["GET"])
def api_get_room_mode(room_id):
    room = lay_phong(room_id)
    if room is None:
        return jsonify({"success": False, "message": "Không tìm thấy phòng", "room_id": room_id}), 404

    mode = lay_che_do_hien_tai(room_id)
    return jsonify({
        "success": True,
        "room_id": room_id,
        "mode": mode
    }), 200


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

    success, message = gui_lenh_che_do(room_id, mode)
    if not success:
        return jsonify({
            "success": False,
            "message": message,
            "room_id": room_id,
            "mode": mode
        }), 500

    return jsonify({
        "success": True,
        "message": message,
        "room_id": room_id,
        "mode": mode
    }), 200


# ============================================================
# API HỌC VIÊN (STUDENTS)
# ============================================================

@app.route("/api/students", methods=["GET"])
def api_students():
    students = lay_danh_sach_hoc_vien()
    if students is None:
        return jsonify({"success": False, "message": "Khong the lay danh sach hoc vien"}), 500
    return jsonify({"success": True, "data": students}), 200


@app.route("/api/students", methods=["POST"])
def api_add_student():
    if not request.is_json:
        return jsonify({"success": False, "message": "Content-Type phai la application/json"}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"success": False, "message": "JSON khong hop le"}), 400

    student_code = (data.get("student_code") or "").strip()
    full_name = (data.get("full_name") or "").strip()
    card_uid = (data.get("card_uid") or "").strip() or None
    class_name = (data.get("class_name") or "").strip() or None
    email = (data.get("email") or "").strip() or None
    phone = (data.get("phone") or "").strip() or None

    if not student_code or not full_name:
        return jsonify({"success": False, "message": "Ma hoc vien va ho ten la bat buoc"}), 400

    success, result = them_hoc_vien(student_code, full_name, class_name, card_uid, email, phone)
    if not success:
        return jsonify({"success": False, "message": result}), 400

    return jsonify({
        "success": True,
        "message": "Them hoc vien thanh cong",
        "student_id": result
    }), 201


@app.route("/api/students/<int:student_id>", methods=["PUT"])
def api_update_student(student_id):
    if not request.is_json:
        return jsonify({"success": False, "message": "Content-Type phai la application/json"}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"success": False, "message": "JSON khong hop le"}), 400

    student_code = (data.get("student_code") or "").strip()
    full_name = (data.get("full_name") or "").strip()
    card_uid = (data.get("card_uid") or "").strip() or None
    class_name = (data.get("class_name") or "").strip() or None
    email = (data.get("email") or "").strip() or None
    phone = (data.get("phone") or "").strip() or None

    if not student_code or not full_name:
        return jsonify({"success": False, "message": "Ma hoc vien va ho ten la bat buoc"}), 400

    success, message = sua_hoc_vien(student_id, student_code, full_name, class_name, card_uid, email, phone)
    if not success:
        return jsonify({"success": False, "message": message}), 400

    return jsonify({"success": True, "message": message}), 200


@app.route("/api/students/<int:student_id>", methods=["DELETE"])
def api_delete_student(student_id):
    success, message = xoa_hoc_vien(student_id)
    if not success:
        return jsonify({"success": False, "message": message}), 500

    return jsonify({"success": True, "message": message}), 200


@app.route("/api/students/<int:student_id>/assign-card", methods=["POST"])
def api_assign_card(student_id):
    if not request.is_json:
        return jsonify({"success": False, "message": "Content-Type phai la application/json"}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"success": False, "message": "JSON khong hop le"}), 400

    card_uid = (data.get("card_uid") or "").strip() or None
    success, message = gan_the_hoc_vien(student_id, card_uid)
    if not success:
        return jsonify({"success": False, "message": message}), 400

    return jsonify({"success": True, "message": message, "card_uid": card_uid}), 200


# ============================================================
# API ĐIỂM DANH (ATTENDANCE)
# ============================================================

@app.route("/api/attendance", methods=["GET"])
def api_attendance():
    room_id = request.args.get("room_id")
    date_filter = request.args.get("date")
    limit = request.args.get("limit", default=50, type=int)

    if limit < 1:
        limit = 50
    if limit > 500:
        limit = 500

    logs = lay_danh_sach_diem_danh(room_id=room_id, limit=limit, ngay=date_filter)
    if logs is None:
        return jsonify({"success": False, "message": "Khong the truy van diem danh"}), 500

    return jsonify({"success": True, "data": logs}), 200


@app.route("/api/attendance/stats", methods=["GET"])
def api_attendance_stats():
    room_id = request.args.get("room_id")
    date_filter = request.args.get("date")

    stats = lay_thong_ke_diem_danh(room_id=room_id, ngay=date_filter)
    if stats is None:
        return jsonify({"success": False, "message": "Khong the tinh thong ke diem danh"}), 500

    return jsonify({"success": True, "data": stats}), 200


@app.route("/api/attendance/latest-scan", methods=["GET"])
def api_latest_scan():
    # Lấy bản ghi quẹt thẻ mới nhất để hỗ trợ gán thẻ nhanh trên giao diện
    logs = lay_danh_sach_diem_danh(limit=1)
    if not logs:
        return jsonify({"success": True, "data": None}), 200
    return jsonify({"success": True, "data": logs[0]}), 200


# ============================================================
# API PHÂN HỆ ĐIỂM DANH LỚP HỌC (ACADEMIC SESSIONS & RECORDS)
# ============================================================

@app.route("/api/attendance/sessions", methods=["GET"])
def api_attendance_sessions():
    room_id = request.args.get("room_id")
    date_filter = request.args.get("date")
    class_id = request.args.get("class_id", type=int)

    sessions = lay_danh_sach_sessions(room_id=room_id, session_date=date_filter, class_id=class_id)
    if sessions is None:
        return jsonify({"success": False, "message": "Không thể tải danh sách ca học do lỗi CSDL"}), 500
    return jsonify({"success": True, "data": sessions}), 200


@app.route("/api/attendance/sessions", methods=["POST"])
def api_create_session():
    if not request.is_json:
        return jsonify({"success": False, "message": "Content-Type phải là application/json"}), 400

    data = request.get_json(silent=True) or {}
    room_id = data.get("room_id")
    class_id = data.get("class_id")
    session_date = data.get("session_date")
    start_time = data.get("start_time")
    end_time = data.get("end_time")

    if not room_id or not class_id:
        return jsonify({"success": False, "message": "Vui lòng cung cấp room_id và class_id"}), 400

    # Validate thứ tự giờ nếu được cung cấp
    if start_time and end_time and start_time >= end_time:
        return jsonify({"success": False, "message": "Giờ bắt đầu phải nhỏ hơn giờ kết thúc"}), 400

    success, session_id, message = tao_session_moi(
        room_id=room_id,
        class_id=int(class_id),
        session_date=session_date,
        start_time=start_time,
        end_time=end_time
    )

    if not success:
        return jsonify({"success": False, "message": message}), 400

    return jsonify({"success": True, "message": message, "session_id": session_id}), 201


@app.route("/api/attendance/sessions/<int:session_id>/records", methods=["GET"])
def api_session_records(session_id):
    records = lay_bang_diem_danh_buoi_hoc(session_id)
    if records is None:
        return jsonify({"success": False, "message": "Không tìm thấy buổi điểm danh"}), 404
    return jsonify({"success": True, "data": records}), 200


@app.route("/api/attendance/records/<int:record_id>", methods=["PUT"])
def api_update_record(record_id):
    if not request.is_json:
        return jsonify({"success": False, "message": "Content-Type phải là application/json"}), 400

    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    note = data.get("note")

    valid_statuses = ["PRESENT", "LATE", "ABSENT_EXCUSED", "ABSENT_UNEXCUSED"]
    if new_status not in valid_statuses:
        return jsonify({
            "success": False,
            "message": f"Trạng thái không hợp lệ. Chỉ chấp nhận: {', '.join(valid_statuses)}"
        }), 400

    success, message = cap_nhat_diem_danh_thu_cong(record_id, new_status, note)
    if not success:
        return jsonify({"success": False, "message": message}), 400

    return jsonify({"success": True, "message": message}), 200


@app.route("/api/attendance/sessions/<int:session_id>/students/<int:student_id>/record", methods=["PUT", "POST"])
def api_upsert_student_session_record(session_id, student_id):
    """Cập nhật hoặc tạo mới bản ghi điểm danh cho sinh viên trong buổi học (áp dụng khi record_id chưa có)."""
    if not request.is_json:
        return jsonify({"success": False, "message": "Content-Type phải là application/json"}), 400

    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    note = data.get("note")

    valid_statuses = ["PRESENT", "LATE", "ABSENT_EXCUSED", "ABSENT_UNEXCUSED"]
    if new_status not in valid_statuses:
        return jsonify({
            "success": False,
            "message": f"Trạng thái không hợp lệ. Chỉ chấp nhận: {', '.join(valid_statuses)}"
        }), 400

    success, message = ghi_nhan_diem_danh_sinh_vien(
        session_id=session_id,
        student_id=student_id,
        status=new_status,
        method="MANUAL_TEACHER",
        note=note
    )
    if not success:
        return jsonify({"success": False, "message": message}), 400

    return jsonify({"success": True, "message": message}), 200


@app.route("/api/attendance/sessions/<int:session_id>/close", methods=["POST"])
def api_close_session(session_id):
    success, message = dong_buoi_diem_danh(session_id)
    if not success:
        return jsonify({"success": False, "message": message}), 400
    return jsonify({"success": True, "message": message}), 200


@app.route("/api/attendance/sessions/<int:session_id>/export", methods=["GET"])
def api_export_session_csv(session_id):
    # Lấy thông tin session
    all_sessions = lay_danh_sach_sessions()
    session_info = next((s for s in all_sessions if s["id"] == session_id), None)
    if not session_info:
        return jsonify({"success": False, "message": "Không tìm thấy buổi học"}), 404

    records = lay_bang_diem_danh_buoi_hoc(session_id) or []

    status_map = {
        "PRESENT": "Có mặt (Đúng giờ)",
        "LATE": "Đi muộn",
        "ABSENT_EXCUSED": "Nghỉ có phép",
        "ABSENT_UNEXCUSED": "Vắng không phép"
    }

    method_map = {
        "RFID": "Quẹt thẻ RFID",
        "MANUAL_TEACHER": "Giảng viên xác nhận",
        "AUTO_ABSENT": "Hệ thống tự động"
    }

    output = io.StringIO()
    # Ghi UTF-8 BOM để Excel hiển thị tiếng Việt chính xác
    output.write('\ufeff')

    writer = csv.writer(output)
    writer.writerow(["BẢNG ĐIỂM DANH LỚP HỌC PHẦN"])
    writer.writerow([f"Môn học: {session_info['subject_name']} ({session_info['subject_code']})"])
    writer.writerow([f"Lớp học phần: {session_info['class_code']} | Học kỳ: {session_info['semester']}"])
    writer.writerow([f"Giảng viên: {session_info['teacher_name']} | Phòng học: {session_info['room_name']}"])
    writer.writerow([f"Ngày học: {session_info['session_date']} | Khung giờ: {session_info['start_time']} - {session_info['end_time']}"])
    writer.writerow([])
    writer.writerow(["STT", "Mã Học Viên", "Họ Và Tên", "Lớp Biên Chế", "Mã Thẻ RFID", "Trạng Thái", "Giờ Quẹt Thẻ", "Hình Thức", "Ghi Chú"])

    for idx, r in enumerate(records, start=1):
        writer.writerow([
            idx,
            r["student_code"],
            r["full_name"],
            r["class_name"] or "",
            r["card_uid"] or "",
            status_map.get(r["status"], r["status"]),
            r["checkin_time"] or "",
            method_map.get(r["method"], r["method"]),
            r["note"] or ""
        ])

    csv_data = output.getvalue()
    filename = f"diem_danh_{session_info['class_code']}_{session_info['session_date']}.csv"

    return Response(
        csv_data,
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.route("/api/course-classes", methods=["GET"])
def api_course_classes():
    classes = lay_danh_sach_lop_hoc_phan()
    return jsonify({"success": True, "data": classes}), 200


@app.route("/api/schedules", methods=["GET"])
def api_schedules():
    room_id = request.args.get("room_id")
    class_id = request.args.get("class_id", type=int)
    schedules = lay_thoi_khoa_bieu(room_id=room_id, class_id=class_id)
    return jsonify({"success": True, "data": schedules}), 200



@app.errorhandler(404)
def not_found(error):
    return jsonify({"success": False, "message": "API khong ton tai"}), 404


# ============================================================
# SCHEDULE CRUD API — THÊM / SỬA / XÓA LỊCH HỌC
# ============================================================

@app.route("/api/schedules", methods=["POST"])
def api_create_schedule():
    """Tạo mới lịch học định kỳ."""
    if not request.is_json:
        return jsonify({"success": False, "message": "Content-Type phải là application/json"}), 400
    data = request.get_json(silent=True) or {}

    class_id = data.get("class_id")
    room_id = data.get("room_id")
    day_of_week = data.get("day_of_week")
    start_time = (data.get("start_time") or "").strip()
    end_time = (data.get("end_time") or "").strip()
    late_grace = data.get("late_grace_period_mins", 15)

    if class_id is None or room_id is None or day_of_week is None:
        return jsonify({"success": False, "message": "Thiếu class_id, room_id hoặc day_of_week"}), 400
    if not start_time or not end_time:
        return jsonify({"success": False, "message": "Thiếu start_time hoặc end_time"}), 400
    if start_time >= end_time:
        return jsonify({"success": False, "message": "start_time phải nhỏ hơn end_time"}), 400
    if int(day_of_week) not in range(0, 7):
        return jsonify({"success": False, "message": "day_of_week phải từ 0 (Thứ Hai) đến 6 (Chủ Nhật)"}), 400

    try:
        success, new_id, message = tao_lich_hoc(
            class_id=int(class_id),
            room_id=room_id,
            day_of_week=int(day_of_week),
            start_time=start_time,
            end_time=end_time,
            late_grace_period_mins=int(late_grace)
        )
        if not success:
            return jsonify({"success": False, "message": message}), 400
        return jsonify({"success": True, "message": message, "schedule_id": new_id}), 201
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route("/api/schedules/<int:schedule_id>", methods=["PUT"])
def api_update_schedule(schedule_id):
    """Cập nhật lịch học."""
    if not request.is_json:
        return jsonify({"success": False, "message": "Content-Type phải là application/json"}), 400
    data = request.get_json(silent=True) or {}

    class_id = data.get("class_id")
    room_id = data.get("room_id")
    day_of_week = data.get("day_of_week")
    start_time = (data.get("start_time") or "").strip()
    end_time = (data.get("end_time") or "").strip()
    late_grace = data.get("late_grace_period_mins", 15)

    if class_id is None or room_id is None or day_of_week is None:
        return jsonify({"success": False, "message": "Thiếu class_id, room_id hoặc day_of_week"}), 400
    if not start_time or not end_time:
        return jsonify({"success": False, "message": "Thiếu start_time hoặc end_time"}), 400
    if start_time >= end_time:
        return jsonify({"success": False, "message": "start_time phải nhỏ hơn end_time"}), 400

    try:
        success, message = sua_lich_hoc(
            schedule_id=schedule_id,
            class_id=int(class_id),
            room_id=room_id,
            day_of_week=int(day_of_week),
            start_time=start_time,
            end_time=end_time,
            late_grace_period_mins=int(late_grace)
        )
        if not success:
            return jsonify({"success": False, "message": message}), 400
        return jsonify({"success": True, "message": message}), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route("/api/schedules/<int:schedule_id>", methods=["DELETE"])
def api_delete_schedule(schedule_id):
    """Xóa lịch học."""
    try:
        success, message = xoa_lich_hoc(schedule_id)
        if not success:
            return jsonify({"success": False, "message": message}), 400
        return jsonify({"success": True, "message": message}), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


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