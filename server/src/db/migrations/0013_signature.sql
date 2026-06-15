-- 0013_signature.sql
-- 用途：评审会签电子签名。新增「用户签名库」表（每人可保存多枚签名，手绘或上传），
--       并在评审会签 release_signoff 上记录本次签署所用签名的存储路径，便于卡片右侧展示。
-- 说明：签名图片以 PNG/JPEG 落盘于 attachments/signatures/<user_id>/；前端以 base64 DataURL 内嵌展示。
-- 作者：hengguan

CREATE TABLE user_signature (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  label       TEXT,                  -- 签名名称（可选）
  stored_path TEXT NOT NULL,         -- 相对 attachments 的存储路径
  is_default  INTEGER NOT NULL DEFAULT 0, -- 默认签名（每人最多一个）
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_user_signature_user ON user_signature(user_id);

-- 评审会签记录本次签署所用签名
ALTER TABLE release_signoff ADD COLUMN signature_path TEXT;
