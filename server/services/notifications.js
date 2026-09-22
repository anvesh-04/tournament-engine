const Notification = require("../models/Notification");
const Team = require("../models/Team");
const User = require("../models/User");
const { sendMail } = require("./mailer");

/**
 * NOTIFYING AFFECTED PLAYERS
 * --------------------------
 * When a match moves, the people who need to know are the players on the two
 * teams in that match. This module works out who that is and tells them twice:
 * once by email, once as a stored in-app Notification.
 *
 * The message-building logic is separated from the database and SMTP work so
 * the wording and the "is this even worth notifying about" decision can be
 * tested directly, without a database.
 */

/**
 * Decides whether a set of applied changes is worth emailing a player about.
 *
 * Only timeSlot and court changes are: those are the ones that send someone to
 * the wrong place at the wrong time. A recorded winner does not change
 * anybody's plans, and emailing every player after every result would train
 * them to ignore the mails that actually matter.
 */
function isNotifiableChange(changes) {
  return (changes || []).some((c) => c.field === "timeSlot" || c.field === "court");
}

/**
 * Builds the player-facing message for a rescheduled match.
 * Deliberately states both the old and new values: "your match moved to slot 5"
 * is useless to someone who has already written down slot 2.
 */
function buildRescheduleMessage({ tournamentName, match, changes }) {
  const fixture = `${match.teamA || "TBD"} vs ${match.teamB || "TBD"}`;
  const parts = [];

  for (const change of changes) {
    const from = change.from === null || change.from === undefined ? "unassigned" : change.from;
    if (change.field === "timeSlot") parts.push(`time slot ${from} to ${change.to}`);
    if (change.field === "court") parts.push(`court ${from} to ${change.to}`);
  }

  if (parts.length === 0) return null;

  return `${tournamentName}: your match ${fixture} has moved — ${parts.join(
    ", and "
  )}. Match reference ${match.matchRefId}.`;
}

/**
 * Finds the player Users on the teams named in a match.
 *
 * Team names on a Tournament are plain strings (the scheduling algorithms
 * require that), so this resolves them back to Team documents within the
 * tournament's sport. A name that matches no Team simply yields no players —
 * that is the normal case for a tournament whose teams were typed in freehand
 * rather than created through the sport-admin flow, and it must not error.
 */
async function findAffectedPlayers(tournament, match) {
  const teamNames = [match.teamA, match.teamB].filter(Boolean);
  if (teamNames.length === 0) return [];

  const teamQuery = { name: { $in: teamNames } };
  // Scope by sport when the tournament has one, so a team of the same name in
  // another sport is never notified about a match it is not in.
  if (tournament.sportId) teamQuery.sportId = tournament.sportId;

  const teams = await Team.find(teamQuery).select("players");
  const playerIds = teams.flatMap((t) => t.players);
  if (playerIds.length === 0) return [];

  return User.find({ _id: { $in: playerIds }, role: "player" }).select("name email");
}

/**
 * Notifies every player affected by a match change.
 *
 * Best-effort by design: this is called after the schedule change has already
 * been validated and saved, so a failure here must not surface as a failed
 * reschedule. Errors are caught and summarised in the return value.
 *
 * @returns { notified, emailsSent, emailsFailed, skipped?, error? }
 */
async function notifyMatchChange({ tournament, match, changes }) {
  try {
    if (!isNotifiableChange(changes)) {
      return { notified: 0, emailsSent: 0, emailsFailed: 0, skipped: "no timetable change" };
    }

    const message = buildRescheduleMessage({
      tournamentName: tournament.name,
      match,
      changes,
    });
    if (!message) {
      return { notified: 0, emailsSent: 0, emailsFailed: 0, skipped: "nothing to say" };
    }

    const players = await findAffectedPlayers(tournament, match);
    if (players.length === 0) {
      return { notified: 0, emailsSent: 0, emailsFailed: 0, skipped: "no registered players" };
    }

    let emailsSent = 0;
    let emailsFailed = 0;

    for (const player of players) {
      const { sent } = await sendMail({
        to: player.email,
        subject: `Schedule change — ${tournament.name}`,
        text: `Hi ${player.name},\n\n${message}\n\nCheck your dashboard for the full schedule.`,
      });
      sent ? emailsSent++ : emailsFailed++;

      // The in-app record is written whether or not the email went out; it is
      // the copy the player is actually guaranteed to see.
      await Notification.create({
        userId: player._id,
        message,
        tournamentId: tournament._id,
        matchRefId: match.matchRefId,
        emailSent: sent,
      });
    }

    return { notified: players.length, emailsSent, emailsFailed };
  } catch (err) {
    console.error(`[notifications] failed for match ${match?.matchRefId}: ${err.message}`);
    return { notified: 0, emailsSent: 0, emailsFailed: 0, error: err.message };
  }
}

/**
 * Emails an invited player their temporary password and records it in-app.
 * Unlike notifyMatchChange this one reports delivery failure to the caller,
 * because an invite that was never delivered leaves an account nobody can
 * get into — the admin needs to know to pass the password on another way.
 */
async function notifyInvite({ user, sportName, temporaryPassword, loginUrl }) {
  const message = `You have been added to ${sportName} on FixtureEngine. Sign in with ${user.email} and change your temporary password.`;

  const { sent, reason } = await sendMail({
    to: user.email,
    subject: `You have been added to ${sportName} on FixtureEngine`,
    text: [
      `Hi ${user.name},`,
      ``,
      `An account has been created for you on FixtureEngine for ${sportName}.`,
      ``,
      `Email:    ${user.email}`,
      `Password: ${temporaryPassword}`,
      ``,
      `You will be asked to choose a new password when you first sign in.`,
      loginUrl ? `Sign in at ${loginUrl}` : ``,
    ].join("\n"),
  });

  await Notification.create({ userId: user._id, message, emailSent: sent });

  return { sent, reason };
}

module.exports = {
  isNotifiableChange,
  buildRescheduleMessage,
  findAffectedPlayers,
  notifyMatchChange,
  notifyInvite,
};
