-- The Wait block takes an amount in a unit (seconds to weeks) instead of seconds (.plan/wait-block-long-waits.md).
-- A saved wait keeps its time: `seconds`, `minSeconds` and `maxSeconds` become `amount`, `minAmount` and `maxAmount`
-- in the unit "seconds". Data only, no column changes. Old keys: seconds, minSeconds, maxSeconds.
CREATE FUNCTION pg_temp.wait_amounts(graph jsonb) RETURNS jsonb AS $$
   SELECT jsonb_set(
      graph,
      '{nodes}',
      (
         SELECT jsonb_agg(
            CASE
               WHEN item.node->>'type' = 'logic.wait'
                  AND item.node->'config' ?| ARRAY['seconds', 'minSeconds', 'maxSeconds']
               THEN jsonb_set(
                  item.node,
                  '{config}',
                  ((item.node->'config') - ARRAY['seconds', 'minSeconds', 'maxSeconds']::text[])
                     || jsonb_build_object('unit', 'seconds')
                     || CASE WHEN item.node->'config' ? 'seconds'
                        THEN jsonb_build_object('amount', item.node->'config'->'seconds') ELSE '{}'::jsonb END
                     || CASE WHEN item.node->'config' ? 'minSeconds'
                        THEN jsonb_build_object('minAmount', item.node->'config'->'minSeconds') ELSE '{}'::jsonb END
                     || CASE WHEN item.node->'config' ? 'maxSeconds'
                        THEN jsonb_build_object('maxAmount', item.node->'config'->'maxSeconds') ELSE '{}'::jsonb END
               )
               ELSE item.node
            END
            ORDER BY item.position
         )
         FROM jsonb_array_elements(graph->'nodes') WITH ORDINALITY AS item(node, position)
      )
   )
$$ LANGUAGE sql IMMUTABLE;

UPDATE "Workflow"
SET "graph" = pg_temp.wait_amounts("graph")
WHERE jsonb_typeof("graph"->'nodes') = 'array' AND "graph"::text LIKE '%"logic.wait"%';

-- Runs keep a copy of the graph they started with; a wait that has not started yet reads it.
UPDATE "WorkflowRun"
SET "graph" = pg_temp.wait_amounts("graph")
WHERE jsonb_typeof("graph"->'nodes') = 'array' AND "graph"::text LIKE '%"logic.wait"%';
