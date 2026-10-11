# Compatibility migration

Applied atomically by `lib/server.ts` after 001_initial.sql. Column existence is checked using PRAGMA table_info before each alteration.

Existing platform schema is preserved with these renames:

- drafts.version → revision
- drafts.needs_review → review_required
- draft_lines.options → option_ids
- orders.fingerprint → request_hash
- order_lines.options → personalization

Add product_options.required and product_options.name when absent. Required option groups are enforced by the server and presented with a selected available option in the dialog. Existing catalog prices and availability remain authoritative. Seeding only occurs when the catalog is empty. Private existing records are not deleted.
