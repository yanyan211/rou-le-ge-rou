-- 每台设备每天只记一次通关（新建数据库时用；已有数据库请执行 ../数据库升级.sql）
CREATE TABLE IF NOT EXISTS clears (
  day TEXT NOT NULL,      -- 'YYYY-MM-DD'（玩家本地日期）
  uid TEXT NOT NULL,      -- 设备随机 id
  ts  INTEGER NOT NULL,   -- 首次通关时间（毫秒）
  rk  INTEGER,            -- 当天第几位通关
  PRIMARY KEY (day, uid)
);
CREATE TABLE IF NOT EXISTS day_counts (
  day TEXT PRIMARY KEY,   -- 'YYYY-MM-DD'
  n   INTEGER NOT NULL    -- 当天通关人数
);
