-- 在庫履歴のサンプルデータ
INSERT INTO stock_history (product_id, change_amount, change_type, reason, created_at) VALUES
  -- iPhone 15 の在庫履歴
  (1, 50, 'in', '初期入庫', '2024-01-20 10:00:00'),
  (1, -1, 'out', '販売（注文ID: 1）', '2025-06-01 10:30:00'),
  (1, 30, 'in', '追加入庫', '2025-06-15 14:30:00'),
  
  -- MacBook Pro の在庫履歴
  (2, 20, 'in', '初期入庫', '2024-01-22 11:15:00'),
  (2, -1, 'out', '販売（注文ID: 3）', '2025-05-15 16:45:00'),
  (2, -5, 'adjustment', '破損による調整', '2025-06-01 09:00:00'),
  
  -- 冷凍ピザの在庫履歴（在庫0になった経緯）
  (10, 25, 'in', '初期入庫', '2024-03-20 09:20:00'),
  (10, -3, 'out', '販売（注文ID: 11）', '2025-02-05 11:20:00'),
  (10, -15, 'adjustment', '期限切れによる廃棄', '2025-05-01 12:00:00'),
  (10, -7, 'adjustment', '追加廃棄', '2025-06-01 10:00:00'),
  
  -- その他商品の在庫調整
  (3, 25, 'in', '初期入庫', '2024-02-01 09:30:00'),
  (3, -1, 'out', '販売（注文ID: 6）', '2025-05-20 13:40:00'),
  (4, 100, 'in', '大量入庫', '2024-02-10 14:20:00'),
  (5, 50, 'in', '初期入庫', '2024-02-15 16:45:00');