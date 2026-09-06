-- ============================================================
-- SMART CLASSROOM - DATABASE MIGRATION STEP 1
-- Bổ sung mô hình Điểm danh Lớp học (Real Attendance System)
-- ============================================================

USE `smartclassroom`;

-- 1. Bảng Môn học (Subjects)
CREATE TABLE IF NOT EXISTS `subjects` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `subject_code` varchar(50) NOT NULL,
  `name` varchar(150) NOT NULL,
  `credits` int(11) DEFAULT 3,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `subject_code` (`subject_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Bảng Lớp học phần (Course Classes)
CREATE TABLE IF NOT EXISTS `course_classes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `class_code` varchar(50) NOT NULL,
  `subject_id` int(11) NOT NULL,
  `teacher_name` varchar(100) DEFAULT NULL,
  `semester` varchar(30) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `class_code` (`class_code`),
  CONSTRAINT `fk_class_subject` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Bảng Danh sách Sinh viên theo Lớp học phần (Class Enrollments)
CREATE TABLE IF NOT EXISTS `class_enrollments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `class_id` int(11) NOT NULL,
  `student_id` int(11) NOT NULL,
  `enrolled_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_class_student` (`class_id`, `student_id`),
  CONSTRAINT `fk_enroll_class` FOREIGN KEY (`class_id`) REFERENCES `course_classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_enroll_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Bảng Thời khóa biểu / Lịch học (Schedules)
-- day_of_week: 0=Thứ 2, 1=Thứ 3, 2=Thứ 4, 3=Thứ 5, 4=Thứ 6, 5=Thứ 7, 6=Chủ Nhật
CREATE TABLE IF NOT EXISTS `schedules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `class_id` int(11) NOT NULL,
  `room_id` int(11) NOT NULL,
  `day_of_week` tinyint(4) NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `late_grace_period_mins` int(11) DEFAULT 15,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_sched_class` FOREIGN KEY (`class_id`) REFERENCES `course_classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sched_room` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Bảng Buổi điểm danh cụ thể (Attendance Sessions)
CREATE TABLE IF NOT EXISTS `attendance_sessions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `schedule_id` int(11) DEFAULT NULL,
  `class_id` int(11) NOT NULL,
  `room_id` int(11) NOT NULL,
  `session_date` date NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'UPCOMING',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_session` (`class_id`, `room_id`, `session_date`, `start_time`),
  CONSTRAINT `fk_session_sched` FOREIGN KEY (`schedule_id`) REFERENCES `schedules` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_session_class` FOREIGN KEY (`class_id`) REFERENCES `course_classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_session_room` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Bảng Kết quả điểm danh học viên (Attendance Records)
-- status: PRESENT (Đúng giờ), LATE (Đi muộn), ABSENT_UNEXCUSED (Vắng không phép), ABSENT_EXCUSED (Vắng có phép)
-- method: RFID (Quẹt thẻ), MANUAL_TEACHER (Giáo viên sửa), AUTO_ABSENT (Hệ thống chốt vắng)
CREATE TABLE IF NOT EXISTS `attendance_records` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `session_id` int(11) NOT NULL,
  `student_id` int(11) NOT NULL,
  `status` varchar(25) NOT NULL DEFAULT 'ABSENT_UNEXCUSED',
  `checkin_time` datetime DEFAULT NULL,
  `method` varchar(25) NOT NULL DEFAULT 'AUTO_ABSENT',
  `note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_session_student` (`session_id`, `student_id`),
  KEY `idx_record_status` (`status`),
  CONSTRAINT `fk_rec_session` FOREIGN KEY (`session_id`) REFERENCES `attendance_sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rec_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- DỮ LIỆU MẪU BAN ĐẦU (SEED DATA)
-- ============================================================

-- Đảm bảo có môn học mẫu
INSERT INTO `subjects` (`subject_code`, `name`, `credits`) VALUES
  ('IOT101', 'Lập trình Hệ thống IoT thông minh', 3),
  ('AI202', 'Trí tuệ nhân tạo và Ứng dụng', 3)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- Đảm bảo có lớp học phần mẫu
INSERT INTO `course_classes` (`class_code`, `subject_id`, `teacher_name`, `semester`)
SELECT 'D20CQCN01-IOT', id, 'ThS. Nguyễn Văn A', '2025-2026_HK1'
FROM `subjects` WHERE `subject_code` = 'IOT101'
ON DUPLICATE KEY UPDATE `teacher_name` = VALUES(`teacher_name`);

INSERT INTO `course_classes` (`class_code`, `subject_id`, `teacher_name`, `semester`)
SELECT 'D20CQCN02-AI', id, 'TS. Trần Thị B', '2025-2026_HK1'
FROM `subjects` WHERE `subject_code` = 'AI202'
ON DUPLICATE KEY UPDATE `teacher_name` = VALUES(`teacher_name`);

-- Gán sinh viên hiện có vào cả 2 lớp học phần mẫu
INSERT IGNORE INTO `class_enrollments` (`class_id`, `student_id`)
SELECT c.id, s.id
FROM `course_classes` c
CROSS JOIN `students` s;

-- Thêm thời khóa biểu mẫu cho tất cả các ngày trong tuần (Thứ 2 đến Chủ Nhật, 0-6)
-- Cho cả room01 và room02, gồm các ca:
-- 1. Ca sáng: 07:00:00 - 11:30:00 (D20CQCN01-IOT)
-- 2. Ca chiều: 12:30:00 - 17:30:00 (D20CQCN02-AI)
-- 3. Ca tối / Test: 18:00:00 - 23:59:59 (D20CQCN01-IOT)
INSERT IGNORE INTO `schedules` (`class_id`, `room_id`, `day_of_week`, `start_time`, `end_time`, `late_grace_period_mins`)
SELECT c.id, r.id, days.d, '07:00:00', '11:30:00', 15
FROM `course_classes` c
JOIN `rooms` r ON r.room_id = 'room01'
CROSS JOIN (SELECT 0 AS d UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) days
WHERE c.class_code = 'D20CQCN01-IOT';

INSERT IGNORE INTO `schedules` (`class_id`, `room_id`, `day_of_week`, `start_time`, `end_time`, `late_grace_period_mins`)
SELECT c.id, r.id, days.d, '12:30:00', '17:30:00', 15
FROM `course_classes` c
JOIN `rooms` r ON r.room_id = 'room01'
CROSS JOIN (SELECT 0 AS d UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) days
WHERE c.class_code = 'D20CQCN02-AI';

INSERT IGNORE INTO `schedules` (`class_id`, `room_id`, `day_of_week`, `start_time`, `end_time`, `late_grace_period_mins`)
SELECT c.id, r.id, days.d, '18:00:00', '23:59:59', 15
FROM `course_classes` c
JOIN `rooms` r ON r.room_id = 'room01'
CROSS JOIN (SELECT 0 AS d UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) days
WHERE c.class_code = 'D20CQCN01-IOT';

-- Tương tự cho room02
INSERT IGNORE INTO `schedules` (`class_id`, `room_id`, `day_of_week`, `start_time`, `end_time`, `late_grace_period_mins`)
SELECT c.id, r.id, days.d, '07:00:00', '23:59:59', 15
FROM `course_classes` c
JOIN `rooms` r ON r.room_id = 'room02'
CROSS JOIN (SELECT 0 AS d UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) days
WHERE c.class_code = 'D20CQCN01-IOT';

-- Khởi tạo sẵn session mẫu cho Ngày hôm nay (CURRENT_DATE) tại room01
INSERT INTO `attendance_sessions` (`schedule_id`, `class_id`, `room_id`, `session_date`, `start_time`, `end_time`, `status`)
SELECT 1, 1, 1, CURRENT_DATE(), '07:00:00', '23:59:59', 'ACTIVE'
WHERE NOT EXISTS (
    SELECT 1 FROM `attendance_sessions` WHERE `room_id` = 1 AND `session_date` = CURRENT_DATE()
);

-- Khởi tạo danh sách sinh viên cho session hôm nay
INSERT IGNORE INTO `attendance_records` (`session_id`, `student_id`, `status`, `method`)
SELECT s.id, ce.student_id, 'ABSENT_UNEXCUSED', 'AUTO_ABSENT'
FROM `attendance_sessions` s
JOIN `class_enrollments` ce ON s.class_id = ce.class_id
WHERE s.session_date = CURRENT_DATE();

