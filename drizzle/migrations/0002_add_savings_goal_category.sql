ALTER TABLE public.savings_goals
  ADD COLUMN category text NOT NULL DEFAULT 'custom';

ALTER TABLE public.savings_goals
  ADD CONSTRAINT savings_goals_category_check
  CHECK (category IN ('education','business','travel','rent','gadget','emergency','custom'));

COMMENT ON COLUMN public.savings_goals.category IS 'Goal category from the fixed app list: education, business, travel, rent, gadget, emergency, custom.';