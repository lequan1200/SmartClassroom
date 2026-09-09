-- Smart Classroom Migration 004: Chuyển đổi quản lý học viên trực tiếp theo Phòng học (Bỏ lớp)
-- Gắn cột room_id trực tiếp vào students

USE `smartclassroom`;

-- 1. Thêm cột room_id vào students
ALTER TABLE `students` 
ADD COLUMN IF NOT EXISTS `room_id` INT NULL AFTER `card_uid`, 
ADD CONSTRAINT `fk_students_room` FOREIGN KEY IF NOT EXISTS (`room_id`) REFERENCES `rooms` (`id`) ON DELETE SET NULL;

-- 2. Đồng bộ room_id từ class_id cho học viên cũ
UPDATE `students` s
JOIN `rooms` r ON (s.class_id = r.class_id OR (s.class_id IS NULL AND r.room_id = 'room01'))
SET s.room_id = r.id
WHERE s.room_id IS NULL;

-- 3. Đảm bảo học viên Quang (ID 39) thuộc phòng room02 (id=2)
UPDATE `students` SET `room_id` = 2 WHERE `id` = 39;
