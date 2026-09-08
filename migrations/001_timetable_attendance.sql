-- Smart Classroom: lớp học, thời khóa biểu và điểm danh theo buổi
-- Chạy toàn bộ file này trong HeidiSQL, trên database `smartclassroom`.

USE `smartclassroom`;

CREATE TABLE IF NOT EXISTS `classes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `class_code` VARCHAR(50) NOT NULL,
  `class_name` VARCHAR(100) NOT NULL,
  `academic_year` VARCHAR(20) DEFAULT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_classes_code` (`class_code`),
  KEY `idx_classes_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `class_students` (
  `class_id` INT NOT NULL,
  `student_id` INT NOT NULL,
  `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `left_at` DATETIME DEFAULT NULL,
  `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (`class_id`, `student_id`),
  KEY `idx_class_students_student` (`student_id`),
  KEY `idx_class_students_status` (`class_id`, `status`),
  CONSTRAINT `fk_class_students_class`
    FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_class_students_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `subjects` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `subject_code` VARCHAR(50) NOT NULL,
  `subject_name` VARCHAR(150) NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_subjects_code` (`subject_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Một lịch lặp lại mỗi tuần. weekday: 1 = Thứ Hai, ... 7 = Chủ Nhật.
CREATE TABLE IF NOT EXISTS `schedules` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `subject_id` INT NOT NULL,
  `room_id` INT NOT NULL,
  `weekday` TINYINT NOT NULL,
  `start_time` TIME NOT NULL,
  `end_time` TIME NOT NULL,
  `checkin_open_minutes` SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  `late_after_minutes` SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  `active_from` DATE NOT NULL,
  `active_to` DATE DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_schedules_room_day_time` (`room_id`, `weekday`, `start_time`),
  CONSTRAINT `chk_schedules_weekday` CHECK (`weekday` BETWEEN 1 AND 7),
  CONSTRAINT `chk_schedules_time` CHECK (`end_time` > `start_time`),
  CONSTRAINT `fk_schedules_subject`
    FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_schedules_room`
    FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Một bản ghi là một buổi học cụ thể theo ngày, sinh từ schedules hoặc tạo thủ công.
CREATE TABLE IF NOT EXISTS `class_sessions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `schedule_id` BIGINT DEFAULT NULL,
  `subject_id` INT NOT NULL,
  `room_id` INT NOT NULL,
  `session_date` DATE NOT NULL,
  `starts_at` DATETIME NOT NULL,
  `ends_at` DATETIME NOT NULL,
  `checkin_opens_at` DATETIME NOT NULL,
  `late_after_at` DATETIME NOT NULL,
  `status` ENUM('SCHEDULED', 'OPEN', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sessions_schedule_date` (`schedule_id`, `session_date`),
  KEY `idx_sessions_room_status_time` (`room_id`, `status`, `checkin_opens_at`, `ends_at`),
  CONSTRAINT `chk_sessions_time` CHECK (`ends_at` > `starts_at`),
  CONSTRAINT `fk_sessions_schedule`
    FOREIGN KEY (`schedule_id`) REFERENCES `schedules` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sessions_subject`
    FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_sessions_room`
    FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `attendance_records` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `session_id` BIGINT NOT NULL,
  `student_id` INT NOT NULL,
  `checkin_at` DATETIME DEFAULT NULL,
  `status` ENUM('PRESENT', 'LATE', 'ABSENT', 'NOT_IN_CLASS') NOT NULL,
  `source` ENUM('RFID', 'MANUAL', 'SYSTEM') NOT NULL DEFAULT 'RFID',
  `raw_log_id` BIGINT DEFAULT NULL,
  `note` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_attendance_session_student` (`session_id`, `student_id`),
  KEY `idx_attendance_student_time` (`student_id`, `checkin_at`),
  KEY `idx_attendance_status` (`session_id`, `status`),
  CONSTRAINT `fk_attendance_session`
    FOREIGN KEY (`session_id`) REFERENCES `class_sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attendance_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_attendance_raw_log`
    FOREIGN KEY (`raw_log_id`) REFERENCES `attendance_logs` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

