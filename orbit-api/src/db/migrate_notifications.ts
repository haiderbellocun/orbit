import { pool } from "./connection";

async function migrateNotifications(): Promise<void> {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS orbit;

    CREATE TABLE IF NOT EXISTS orbit.notification (
      id BIGSERIAL PRIMARY KEY,
      recipient_person_id INTEGER NOT NULL,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      body TEXT,
      payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      read_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_notification_recipient_created
      ON orbit.notification (recipient_person_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_notification_recipient_unread
      ON orbit.notification (recipient_person_id)
      WHERE read_at IS NULL;
  `);
}

migrateNotifications()
  .then(() => {
    console.log("migrate_notifications: OK");
    process.exit(0);
  })
  .catch((e) => {
    console.error("migrate_notifications failed:", e);
    process.exit(1);
  });
