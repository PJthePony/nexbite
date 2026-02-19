-- Tessio Color Refinement: Migrate from Electric Brights to Soft Jewel palette
-- This migration remaps existing workstream color_text and color_bg values.

-- Map old text colors (accent) to new Soft Jewel values
UPDATE workstreams SET color_text = CASE color_text
  WHEN '#2563eb' THEN '#3b6fc2'   -- Electric Blue  → Sapphire
  WHEN '#f43f5e' THEN '#d4576b'   -- Neon Rose      → Rose
  WHEN '#14b8a6' THEN '#27907e'   -- Turquoise      → Jade
  WHEN '#f97316' THEN '#d48a3a'   -- Tangerine      → Amber
  WHEN '#a855f7' THEN '#8855bb'   -- Violet         → Amethyst
  WHEN '#10b981' THEN '#2e9664'   -- Neon Green     → Emerald
  WHEN '#ca8a04' THEN '#b09630'   -- Lemon          → Gold
  WHEN '#ec4899' THEN '#c45580'   -- Flamingo       → Peony
  WHEN '#06b6d4' THEN '#1a96a8'   -- Aqua           → Teal
  WHEN '#e11d48' THEN '#c43e44'   -- Watermelon     → Ruby
  WHEN '#78716c' THEN '#7a7168'   -- Stone          → Stone
  WHEN '#64748b' THEN '#5c6b7a'   -- Slate          → Slate
  ELSE color_text
END;

-- Map old bg colors (pastel fill) to new Soft Jewel values
UPDATE workstreams SET color_bg = CASE color_bg
  WHEN '#dbeafe' THEN '#dce8f5'   -- Electric Blue  → Sapphire
  WHEN '#ffe4e6' THEN '#f5dde1'   -- Neon Rose      → Rose
  WHEN '#ccfbf1' THEN '#d4efe9'   -- Turquoise      → Jade
  WHEN '#ffedd5' THEN '#f5e8d5'   -- Tangerine      → Amber
  WHEN '#e9d5ff' THEN '#e8ddf5'   -- Violet         → Amethyst
  WHEN '#d1fae5' THEN '#d5f0e2'   -- Neon Green     → Emerald
  WHEN '#fef08a' THEN '#f0ebd3'   -- Lemon          → Gold
  WHEN '#fce7f3' THEN '#f5dde8'   -- Flamingo       → Peony
  WHEN '#cffafe' THEN '#d3eff3'   -- Aqua           → Teal
  WHEN '#fecdd3' THEN '#f5dcdd'   -- Watermelon     → Ruby
  WHEN '#f5f5f4' THEN '#eeecea'   -- Stone          → Stone
  WHEN '#f1f5f9' THEN '#e3e8ed'   -- Slate          → Slate
  ELSE color_bg
END;
