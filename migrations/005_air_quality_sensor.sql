-- Migration 005: Cap nhat cam bien gas sang air_quality (MQ-135)
-- Ngay tao: 2026-09-10

USE `smartclassroom`;

-- Cap nhat sensor_name, sensor_type, unit cho cac ban ghi gas
UPDATE `sensors`
SET `sensor_name` = 'air_quality',
    `sensor_type` = 'MQ135',
    `unit` = 'raw'
WHERE `sensor_name` = 'gas';

-- Kiem tra neu phong chua co sensor air_quality thi chen bo sung (phong 1 va phong 2)
INSERT INTO `sensors` (`room_id`, `sensor_name`, `sensor_type`, `unit`)
SELECT r.`id`, 'air_quality', 'MQ135', 'raw'
FROM `rooms` r
WHERE r.`room_id` IN ('room01', 'room02')
  AND NOT EXISTS (
    SELECT 1 FROM `sensors` s
    WHERE s.`room_id` = r.`id` AND s.`sensor_name` = 'air_quality'
  );
