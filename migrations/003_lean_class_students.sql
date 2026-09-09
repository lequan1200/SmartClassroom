-- Smart Classroom Migration 003: Tinh gọn và tách biệt hoàn toàn học sinh theo lớp
-- Loại bỏ bảng trung gian class_students, gắn class_id trực tiếp vào students và schedules

USE `smartclassroom`;

-- 1. Thêm cột class_id vào bảng students nếu chưa có
SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'smartclassroom' AND TABLE_NAME = 'students' AND COLUMN_NAME = 'class_id'
);
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `students` ADD COLUMN `class_id` INT NULL AFTER `card_uid`, ADD CONSTRAINT `fk_students_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE SET NULL', 
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Đồng bộ dữ liệu cũ: nếu bảng class_students còn tồn tại, sao chép class_id sang students
SET @tbl_exists = (
    SELECT COUNT(*) FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = 'smartclassroom' AND TABLE_NAME = 'class_students'
);
SET @sql_sync = IF(@tbl_exists > 0,
    'UPDATE `students` s JOIN `class_students` cs ON cs.student_id = s.id SET s.class_id = cs.class_id WHERE s.class_id IS NULL',
    'SELECT 1'
);
PREPARE stmt_sync FROM @sql_sync;
EXECUTE stmt_sync;
DEALLOCATE PREPARE stmt_sync;

-- Đồng bộ thêm theo class_code nếu class_id vẫn NULL
UPDATE `students` s 
JOIN `classes` c ON (s.class_name = c.class_code OR s.class_name = c.class_name) 
SET s.class_id = c.id 
WHERE s.class_id IS NULL;

-- Đảm bảo học sinh mẫu 001 và 002 thuộc lớp CNTT01 (id=1) nếu chưa gán
UPDATE `students` SET `class_id` = 1 WHERE `student_code` IN ('001', '002') AND `class_id` IS NULL;

-- 3. Thêm cột class_id vào schedules nếu chưa có
SET @col_sched_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'smartclassroom' AND TABLE_NAME = 'schedules' AND COLUMN_NAME = 'class_id'
);
SET @sql_sched = IF(@col_sched_exists = 0, 
    'ALTER TABLE `schedules` ADD COLUMN `class_id` INT NULL AFTER `id`, ADD CONSTRAINT `fk_schedules_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE SET NULL', 
    'SELECT 1'
);
PREPARE stmt_sched FROM @sql_sched;
EXECUTE stmt_sched;
DEALLOCATE PREPARE stmt_sched;

-- 4. Thêm cột class_id vào class_sessions nếu chưa có
SET @col_sess_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'smartclassroom' AND TABLE_NAME = 'class_sessions' AND COLUMN_NAME = 'class_id'
);
SET @sql_sess = IF(@col_sess_exists = 0, 
    'ALTER TABLE `class_sessions` ADD COLUMN `class_id` INT NULL AFTER `schedule_id`, ADD CONSTRAINT `fk_sessions_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE SET NULL', 
    'SELECT 1'
);
PREPARE stmt_sess FROM @sql_sess;
EXECUTE stmt_sess;
DEALLOCATE PREPARE stmt_sess;

-- 5. Xóa bảng trung gian class_students để triệt tiêu trùng lặp
DROP TABLE IF EXISTS `class_students`;
