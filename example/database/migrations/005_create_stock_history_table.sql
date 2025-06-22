-- 在庫履歴テーブル
CREATE TABLE IF NOT EXISTS stock_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  change_amount INTEGER NOT NULL,
  change_type TEXT NOT NULL, -- 'in', 'out', 'adjustment'
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id)
);