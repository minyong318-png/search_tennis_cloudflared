-- alarms
CREATE TABLE IF NOT EXISTS alarms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id TEXT NOT NULL,
  court_group TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(subscription_id, court_group, date)
);

-- push_subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- sent_slots
CREATE TABLE IF NOT EXISTS sent_slots (
  subscription_id TEXT NOT NULL,
  slot_key TEXT NOT NULL,
  sent_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY(subscription_id, slot_key)
);

-- baseline_slots
CREATE TABLE IF NOT EXISTS baseline_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id TEXT NOT NULL,
  court_group TEXT NOT NULL,
  date TEXT NOT NULL,
  time_content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(subscription_id, court_group, date, time_content)
);
