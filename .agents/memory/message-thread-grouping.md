---
name: Message thread grouping
description: The mobile conversation-list identity and booking reference rules.
---

The visible mobile message thread is keyed by the other participant, not by `booking_id`. Keep all related booking IDs on that thread; use the latest valid booking for new sends and retain each message's original booking ID for history and delivery.

**Why:** Students and teachers expect one conversation with the same person. A booking is the platform's message foreign key, but it is not the user's conversation identity.

**How to apply:** Group list rows by participant user ID, aggregate history and unread counts across the group's booking IDs, and preserve booking-specific routing for uploads, notifications, and writes.