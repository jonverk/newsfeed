-- Correct the two leadership names in the published organization chart.
UPDATE rules
SET body_md = replace(
  replace(body_md,
    'Executive Unit<br/>Aisha (AIS)',
    'Executive Unit<br/>Zhi (ZHI)'),
  'Chief Engineer at HQ<br/>Responsibilities for RnD<br/>Zhi (ZHI)',
  'Chief Engineer at HQ<br/>Responsibilities for RnD<br/>Aisha (AIS)'),
  updated_at = datetime('now')
WHERE rule_id = 'ORG-001' OR slug = 'org-chart';
