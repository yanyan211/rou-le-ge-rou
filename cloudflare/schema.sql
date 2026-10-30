-- 每台设备每天只记一次通关
CREATE TABLE IF NOT EXISTS clears (
  day TEXT NOT NULL,      -- 'YYYY-MM-DD'（玩家本地日期）
  uid TEXT NOT NULL,      -- 设备随机 id
  ts  INTEGER NOT NULL,   -- 首次通关时间（毫秒）
  PRIMARY KEY (day, uid)
);
