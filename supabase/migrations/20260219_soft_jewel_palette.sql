-- Tessio Color Revert: Migrate from Soft Jewel back to original vivid accent colors
-- Run this if you previously ran the Soft Jewel migration.

-- Map Soft Jewel text colors back to vivid originals
UPDATE workstreams SET color_text = CASE color_text
  WHEN '#3b6fc2' THEN '#2563eb'   -- Sapphire → Electric Blue
  WHEN '#d4576b' THEN '#f43f5e'   -- Rose     → Neon Rose
  WHEN '#27907e' THEN '#14b8a6'   -- Jade     → Turquoise
  WHEN '#d48a3a' THEN '#f97316'   -- Amber    → Tangerine
  WHEN '#8855bb' THEN '#a855f7'   -- Amethyst → Violet
  WHEN '#2e9664' THEN '#10b981'   -- Emerald  → Neon Green
  WHEN '#b09630' THEN '#ca8a04'   -- Gold     → Lemon
  WHEN '#c45580' THEN '#ec4899'   -- Peony    → Flamingo
  WHEN '#1a96a8' THEN '#06b6d4'   -- Teal     → Aqua
  WHEN '#c43e44' THEN '#e11d48'   -- Ruby     → Watermelon
  WHEN '#7a7168' THEN '#78716c'   -- Stone    → Stone
  WHEN '#5c6b7a' THEN '#64748b'   -- Slate    → Slate
  ELSE color_text
END;

-- Map Soft Jewel bg colors back to vivid originals
UPDATE workstreams SET color_bg = CASE color_bg
  WHEN '#dce8f5' THEN '#dbeafe'   -- Sapphire → Electric Blue
  WHEN '#f5dde1' THEN '#ffe4e6'   -- Rose     → Neon Rose
  WHEN '#d4efe9' THEN '#ccfbf1'   -- Jade     → Turquoise
  WHEN '#f5e8d5' THEN '#ffedd5'   -- Amber    → Tangerine
  WHEN '#e8ddf5' THEN '#e9d5ff'   -- Amethyst → Violet
  WHEN '#d5f0e2' THEN '#d1fae5'   -- Emerald  → Neon Green
  WHEN '#f0ebd3' THEN '#fef08a'   -- Gold     → Lemon
  WHEN '#f5dde8' THEN '#fce7f3'   -- Peony    → Flamingo
  WHEN '#d3eff3' THEN '#cffafe'   -- Teal     → Aqua
  WHEN '#f5dcdd' THEN '#fecdd3'   -- Ruby     → Watermelon
  WHEN '#eeecea' THEN '#f5f5f4'   -- Stone    → Stone
  WHEN '#e3e8ed' THEN '#f1f5f9'   -- Slate    → Slate
  ELSE color_bg
END;
