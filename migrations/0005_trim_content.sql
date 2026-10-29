-- Keep the four requested entries; retain other entries in trash for recovery.
UPDATE rules SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP)
WHERE slug NOT IN ('safety', 'strict-logging-protocol');
UPDATE posts SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP)
WHERE slug NOT IN ('jonverk-why-does-it-even-exist', 'projects-jonverk-online');
DELETE FROM search_index WHERE (kind = 'rule' AND slug NOT IN ('safety', 'strict-logging-protocol'))
  OR (kind = 'post' AND slug NOT IN ('jonverk-why-does-it-even-exist', 'projects-jonverk-online'));
UPDATE content_state SET changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), version = version + 1 WHERE id = 1;
