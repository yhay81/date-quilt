WITH
event_counts AS (
  SELECT
    COUNT(DISTINCT CASE WHEN name = 'visited' THEN session_id END) AS users,
    COUNT(DISTINCT CASE WHEN name = 'share_copied' THEN context END) AS shared_schedules,
    COUNT(DISTINCT CASE WHEN name = 'calendar_added' THEN session_id || ':' || context END)
      AS calendar_adds,
    COUNT(DISTINCT CASE WHEN name = 'returned' THEN session_id END) AS returned,
    COUNT(DISTINCT CASE
      WHEN name = 'visited' AND occurred_on >= date('now', '-6 days') THEN session_id
    END) AS users_7d
  FROM product_events
),
schedule_counts AS (
  SELECT
    COUNT(*) AS schedules_created,
    COUNT(CASE WHEN status = 'finalized' THEN 1 END) AS finalized,
    COUNT(CASE WHEN created_at >= unixepoch() - (7 * 86400) THEN 1 END) AS schedules_7d
  FROM schedules
),
participant_counts AS (
  SELECT
    COUNT(*) AS responses,
    COUNT(DISTINCT schedule_id) AS schedules_with_responses
  FROM participants
),
three_response_schedules AS (
  SELECT COUNT(*) AS schedules_with_three_responses
  FROM (
    SELECT schedule_id
    FROM participants
    GROUP BY schedule_id
    HAVING COUNT(*) >= 3
  )
),
repeat_organizers AS (
  SELECT COUNT(*) AS repeat_organizers
  FROM (
    SELECT creator_session_id
    FROM schedules
    GROUP BY creator_session_id
    HAVING COUNT(*) >= 2
  )
)
SELECT
  event_counts.*,
  schedule_counts.*,
  participant_counts.*,
  three_response_schedules.schedules_with_three_responses,
  repeat_organizers.repeat_organizers
FROM event_counts, schedule_counts, participant_counts,
  three_response_schedules, repeat_organizers;
