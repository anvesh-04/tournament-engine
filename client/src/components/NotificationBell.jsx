import React, { useEffect, useRef, useState } from "react";
import { getMyNotifications, markNotificationsRead } from "../api.js";

/**
 * In-app unread indicator. This is the copy of a schedule change a player is
 * actually guaranteed to see — the email may bounce or go unread.
 */
export default function NotificationBell() {
  const [data, setData] = useState({ notifications: [], unreadCount: 0 });
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const load = () =>
    getMyNotifications()
      .then(setData)
      .catch(() => {
        /* a failed poll should never break the page chrome */
      });

  useEffect(() => {
    load();
    // Cheap polling rather than a websocket: nothing else in this app needs a
    // live connection, and one endpoint every 60s does not justify the
    // infrastructure.
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  // Close when clicking outside the panel.
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && data.unreadCount > 0) {
      try {
        await markNotificationsRead();
        setData((d) => ({ ...d, unreadCount: 0 }));
      } catch {
        /* leaving them unread is the safe failure */
      }
    }
  };

  return (
    <div className="bell-wrap" ref={containerRef}>
      <button
        className="secondary bell-button"
        onClick={toggle}
        aria-label={`Notifications${data.unreadCount ? `, ${data.unreadCount} unread` : ""}`}
      >
        Alerts
        {data.unreadCount > 0 && <span className="bell-badge">{data.unreadCount}</span>}
      </button>

      {open && (
        <div className="bell-panel">
          {data.notifications.length === 0 && (
            <div className="bell-empty">
              Nothing yet. Schedule changes affecting you show up here.
            </div>
          )}
          {data.notifications.map((n) => (
            <div className={`bell-item ${n.read ? "" : "unread"}`} key={n._id}>
              <div>{n.message}</div>
              <div className="bell-time">
                {new Date(n.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
