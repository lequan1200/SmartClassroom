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

-- Gán sinh viên hiện có vào lớp học phần D20CQCN01-IOT
INSERT IGNORE INTO `class_enrollments` (`class_id`, `student_id`)
SELECT c.id, s.id
FROM `course_classes` c
CROSS JOIN `students` s
WHERE c.class_code = 'D20CQCN01-IOT';

-- Thêm thời khóa biểu mẫu cho Phòng 01 (room_id = 1)
-- Ca sáng: 07:00 - 11:15 (Tất cả các ngày trong tuần từ Thứ 2 đến Thứ 7)
INSERT INTO `schedules` (`class_id`, `room_id`, `day_of_week`, `start_time`, `end_time`, `late_grace_period_mins`)
SELECT c.id, r.id, 0, '07:00:00', '11:15:00', 15
FROM `course_classes` c, `rooms` r
WHERE c.class_code = 'D20CQCN01-IOT' AND r.room_id = 'room01'
LIMIT 1;
