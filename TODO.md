# Project roadmap and remaining work

## Completed in this pass

- Customer checkout flow is now functional in the storefront.
- Delivery address creation and listing are supported through the customer API.
- The bag flow now supports address selection and order placement with an idempotency key.
- The checkout path uses real API routes instead of a disabled placeholder state.
- Regression coverage exists for the address-based customer flow.

## High priority backlog

- [ ] Integrate a production-grade payment provider and webhook processing
- [ ] Add automatic expiry for unpaid reservations and release inventory safely
- [ ] Complete the offline order reconciliation and sync intake workflow
- [ ] Add password reset and self-service account recovery
- [ ] Add customer account deactivation and suspension flow

## Medium priority backlog

- [ ] Add direct image upload support for product media
- [ ] Add admin tooling for payment status reconciliation and refunds
- [ ] Add scheduled backup validation and restore drills
- [ ] Add deployment observability and alerting setup

## Low priority backlog

- [ ] Add broader production recovery tests for PostgreSQL and Redis failures
- [ ] Add stronger operational runbooks for support and incident response
- [ ] Expand storefront flows for more advanced account management

## Notes

This project already contains a strong backend foundation and tested API coverage. The remaining work is operational and product-specific rather than a structural refactor.
