-- Turn content: add roll-weighting and title/headline support
ALTER TABLE turn_content ADD COLUMN title TEXT;
ALTER TABLE turn_content ADD COLUMN trigger_weight REAL;   -- null = use rule default; 0.0–1.0 override
ALTER TABLE turn_content ADD COLUMN direction_bias INTEGER; -- null = roll; 1 = positive; -1 = negative
ALTER TABLE turn_content ADD COLUMN stat_hint TEXT;        -- null = no hint; one of the StatName values
ALTER TABLE turn_content ADD COLUMN target_hint TEXT;      -- null = defer to GM; player name / party / region

-- Bills: store roll weights for deferred post-vote stat rolls
ALTER TABLE bills ADD COLUMN trigger_weight REAL;
ALTER TABLE bills ADD COLUMN direction_bias INTEGER;
ALTER TABLE bills ADD COLUMN stat_hint TEXT;
ALTER TABLE bills ADD COLUMN target_hint TEXT;
