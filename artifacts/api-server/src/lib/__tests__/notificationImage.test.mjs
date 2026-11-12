import assert from "node:assert/strict";
import test from "node:test";
import { findNotificationImageUrl } from "../notificationImage.ts";
import {
  DEFAULT_NOTIFICATION_CHANNEL,
  MESSAGE_NOTIFICATION_CHANNEL,
  notificationPresentation,
} from "../expoPush.ts";

test("notification image URL is resolved from common platform field names", () => {
  const imageUrl = "https://cdn.example.com/notices/launch.webp?token=abc";
  assert.equal(findNotificationImageUrl({ image_url: imageUrl }), imageUrl);
  assert.equal(findNotificationImageUrl({ imageUrl }), imageUrl);
  assert.equal(findNotificationImageUrl({ announcement_photo: imageUrl }), imageUrl);
});

test("notification image URL is resolved from nested metadata and JSON strings", () => {
  const imageUrl = "https://cdn.example.com/notices/welcome.png";
  assert.equal(findNotificationImageUrl({
    metadata: JSON.stringify({ content: { image: { url: imageUrl } } }),
  }), imageUrl);
});

test("non-HTTPS and unrelated links are not treated as notification images", () => {
  assert.equal(findNotificationImageUrl({ image_url: "http://cdn.example.com/image.jpg" }), null);
  assert.equal(findNotificationImageUrl({ route: "https://example.com/bookings" }), null);
  assert.equal(findNotificationImageUrl({ image_url: "javascript:alert(1)" }), null);
});

test("automated booking and session notifications use the compatible default channel", () => {
  for (const type of ["booking_request", "booking_cancelled", "session_reminder", "session_started", "session_join", "instant_session"]) {
    assert.deepEqual(notificationPresentation(type), {
      sound: "default",
      channelId: DEFAULT_NOTIFICATION_CHANNEL,
    });
  }
  assert.equal(notificationPresentation("chat_message").channelId, MESSAGE_NOTIFICATION_CHANNEL);
});
