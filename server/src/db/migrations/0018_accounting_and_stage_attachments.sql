ALTER TABLE requirement ADD COLUMN is_accounting TEXT NOT NULL DEFAULT '否';
ALTER TABLE ticket ADD COLUMN is_accounting TEXT NOT NULL DEFAULT '否';

UPDATE requirement SET is_accounting = '否' WHERE is_accounting IS NULL OR is_accounting = '';
UPDATE ticket SET is_accounting = '否' WHERE is_accounting IS NULL OR is_accounting = '';
