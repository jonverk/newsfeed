-- Add placeholders for the Hermes profiles currently present. Preserve edited descriptions.
INSERT OR IGNORE INTO agent_profiles(tag, body_md) VALUES ('KLI', 'profile_placeholder');
INSERT OR IGNORE INTO agent_profiles(tag, body_md) VALUES ('ERI', 'profile_placeholder');
INSERT OR IGNORE INTO agent_profiles(tag, body_md) VALUES ('EVA', 'profile_placeholder');
UPDATE content_state SET changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), version = version + 1 WHERE id = 1;
