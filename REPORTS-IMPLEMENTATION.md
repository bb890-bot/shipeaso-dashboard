# State × Product CSV Reports

The report feature provides a state-wise product matrix (default) and a product-wise state breakdown. Large exports use Shopify GraphQL Bulk Operations rather than the existing 10,000-order dashboard cache. Orders are counted once per product within a Shopify order; the state-matrix total is the sum of product-order counts, not necessarily distinct orders.

The existing dashboard 10,000-order fetch limit remains until its live analytics pipeline is migrated to persistent storage. Run a build, validate Shopify bulk permissions, and test with real order data before promoting to production.