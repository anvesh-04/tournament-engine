const mongoose = require("mongoose");

/**
 * An in-app notification for one user.
 *
 * These are stored in addition to the outbound email, not instead of it.
 * Email can bounce, be filtered, or simply not be checked before a player
 * turns up at the wrong court; the in-app unread indicator is the copy the
 * player will actually see when they open their dashboard.
 */
const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },

    // Optional context so the client can deep-link to the affected match.
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      default: null,
    },
    matchRefId: { type: String, default: null },

    // Whether the matching email actually went out. Kept so an admin can tell
    // "the player was not told" apart from "the player was told and ignored
    // it" when email delivery is misconfigured.
    emailSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// The dashboard's only query is "this user's notifications, newest first".
notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
