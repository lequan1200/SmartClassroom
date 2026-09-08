-- Dữ liệu mẫu cho lớp CNTT01 và môn IoT.
-- Chạy sau file 001_timetable_attendance.sql.

USE `smartclassroom`;

-- 1. Tạo lớp (có thể chạy lại mà không tạo trùng mã lớp).
INSERT INTO `classes` (`class_code`, `class_name`, `academic_year`, `description`)
VALUES ('CNTT01', 'Công nghệ thông tin 01', '2026-2027', 'Lớp mẫu cho hệ thống Smart Classroom')
ON DUPLICATE KEY UPDATE
  `class_name` = VALUES(`class_name`),
  `academic_year` = VALUES(`academic_year`),
  `description` = VALUES(`description`),
  `is_active` = 1;

-- 2. Tạo môn học.
INSERT INTO `subjects` (`subject_code`, `subject_name`, `description`)
VALUES ('IOT', 'Internet of Things', 'Môn học IoT')
ON DUPLICATE KEY UPDATE
  `subject_name` = VALUES(`subject_name`),
  `description` = VALUES(`description`),
  `is_active` = 1;

-- 3. Lấy ID của lớp, môn học và phòng room01.
SET @class_id = (SELECT `id` FROM `classes` WHERE `class_code` = 'CNTT01' LIMIT 1);
SET @subject_id = (SELECT `id` FROM `subjects` WHERE `subject_code` = 'IOT' LIMIT 1);
SET @room_id = (SELECT `id` FROM `rooms` WHERE `room_id` = 'room01' LIMIT 1);

-- Kiểm tra kết quả: cả ba giá trị phải khác NULL trước khi chạy các câu INSERT tiếp theo.
SELECT @class_id AS class_id, @subject_id AS subject_id, @room_id AS room_id;

-- 4. Gán tất cả học viên hiện có vào lớp CNTT01.
-- Nếu chỉ muốn gán một học viên, thêm: WHERE student_code = '001'.
INSERT INTO `class_students` (`class_id`, `student_id`, `status`)
SELECT @class_id, `id`, 'ACTIVE'
FROM `students`
ON DUPLICATE KEY UPDATE
  `status` = 'ACTIVE',
  `left_at` = NULL;

-- 5. Tạo lịch mẫu: Thứ Hai (weekday = 1), 07:00–09:00, tại room01.
-- active_from là ngày bắt đầu áp dụng lịch; hãy đổi khi cần.
-- Có thể chạy lại script: điều kiện NOT EXISTS ngăn tạo lịch trùng.
INSERT INTO `schedules` (
  `class_id`, `subject_id`, `room_id`, `weekday`,
  `start_time`, `end_time`, `checkin_open_minutes`, `late_after_minutes`,
  `active_from`, `active_to`, `is_active`
)
SELECT
  @class_id, @subject_id, @room_id, 1,
  '07:00:00', '09:00:00', 15, 10,
  '2026-09-08', NULL, 1
WHERE @class_id IS NOT NULL
  AND @subject_id IS NOT NULL
  AND @room_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `schedules`
    WHERE `class_id` = @class_id
      AND `subject_id` = @subject_id
      AND `room_id` = @room_id
      AND `weekday` = 1
      AND `start_time` = '07:00:00'
      AND `active_from` = '2026-09-08'
  );

-- Xem lại dữ liệu vừa tạo.
SELECT c.class_code, c.class_name, st.student_code, st.full_name
FROM `class_students` cs
JOIN `classes` c ON c.id = cs.class_id
JOIN `students` st ON st.id = cs.student_id
WHERE c.class_code = 'CNTT01';

SELECT s.id, c.class_code, sub.subject_name, r.room_id,
       s.weekday, s.start_time, s.end_time,
       s.checkin_open_minutes, s.late_after_minutes, s.active_from, s.active_to
FROM `schedules` s
JOIN `classes` c ON c.id = s.class_id
JOIN `subjects` sub ON sub.id = s.subject_id
JOIN `rooms` r ON r.id = s.room_id
WHERE c.class_code = 'CNTT01'
ORDER BY s.weekday, s.start_time;
