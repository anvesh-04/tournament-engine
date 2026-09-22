const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/**
 * Roles, from most to least privileged:
 *   super-admin  — full access across every sport.
 *   sport-admin  — owns exactly one sport; may create and edit tournaments,
 *                  teams and players under that sport only.
 *   player       — read-only view of their own team's matches and standings.
 */
const ROLES = ["super-admin", "sport-admin", "player"];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },

    // Scope refs. Which of these is required depends on the role — see the
    // pre-validate hook below. They are deliberately not `required` at the
    // field level because the requirement is conditional.
    sport: { type: mongoose.Schema.Types.ObjectId, ref: "Sport", default: null },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", default: null },

    // Set when an admin invites a player with a generated temporary password.
    // The client uses this to force a password change on first login.
    mustChangePassword: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/**
 * Enforce the role/scope pairing at the model layer so no route can persist a
 * nonsensical user — e.g. a sport-admin with no sport, which would either lock
 * them out of everything or (worse, if a route defaulted on null) hand them
 * access to every sport.
 */
userSchema.pre("validate", function (next) {
  if (this.role === "sport-admin" && !this.sport) {
    return next(new Error("A sport-admin must be assigned a sport."));
  }
  if (this.role === "player" && !this.sport) {
    return next(new Error("A player must belong to a sport."));
  }
  if (this.role === "super-admin" && (this.sport || this.teamId)) {
    // A super-admin scoped to one sport would be a contradiction that the
    // ownership check below could read either way. Refuse it outright.
    return next(new Error("A super-admin must not be scoped to a sport or team."));
  }
  next();
});

/** Hashes a plaintext password. Cost 10 is bcrypt's common default. */
userSchema.statics.hashPassword = function (plain) {
  return bcrypt.hash(plain, 10);
};

/** Constant-time comparison via bcrypt. Returns a promise of boolean. */
userSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

/**
 * Never let the password hash reach a JSON response. Doing this at the schema
 * level means a route that forgets to `.select("-passwordHash")` still can't
 * leak it.
 */
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
};

userSchema.statics.ROLES = ROLES;

module.exports = mongoose.model("User", userSchema);
module.exports.ROLES = ROLES;
